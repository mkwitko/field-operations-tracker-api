import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Sobe o app real para provar que os escopos protegidos estão gateados de fato
// — é isso que pega alguém removendo um `scoped.register(requireAcessoLiberado)`.
// Só env, Cognito e Prisma são mockados.
const usuariosFindUnique = vi.fn();
const usuariosFindUniqueOrThrow = vi.fn();
const permissoesFindMany = vi.fn();

vi.mock("@/env", () => {
  const { generateKeyPairSync } = require("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  return {
    env: {
      PORT: 3333,
      ENVIRONMENT: "development",
      DATABASE_URL: "postgresql://localhost:5432/test",
      JWT_PRIVATE_KEY: Buffer.from(privateKey).toString("base64"),
      JWT_PUBLIC_KEY: Buffer.from(publicKey).toString("base64"),
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      REDIRECT_URI: "http://localhost:3333/oauth/callback",
      EXPO_SCHEME: "fieldopstracker",
      COGNITO_REGION: "us-east-1",
      COGNITO_USER_POOL_ID: "pool",
      COGNITO_USER_POOL_CLIENT_ID: "client",
      BYPASS_EMAILS: "",
      MOCK_ENABLED: "false",
      MOCK_BYPASS: "true",
    },
  };
});

vi.mock("amazon-cognito-identity-js", () => ({
  CognitoUserPool: vi.fn(() => ({ signUp: vi.fn() })),
  CognitoUser: vi.fn(() => ({})),
  CognitoUserAttribute: vi.fn(() => ({})),
  AuthenticationDetails: vi.fn(() => ({})),
}));

vi.mock("prisma/db", () => ({
  prisma: {
    usuarios: {
      findUnique: (args: unknown) => usuariosFindUnique(args),
      findUniqueOrThrow: (args: unknown) => usuariosFindUniqueOrThrow(args),
    },
    // Mockada só para o caso do cargo 56 poder assertar o 200 real do handler
    // em vez de um "não é 403" que um 500 também satisfaria.
    permissoes: {
      findMany: (args: unknown) => permissoesFindMany(args),
    },
    nucleos: {},
    regioes: {},
  },
}));

import { app } from "@/app";

// Uma rota de cada escopo protegido, para o teste falhar se algum registro
// desaparecer. `/permissoes` cobre o escopo do routes/index.ts; `/sheets`,
// `/auth/status` e `/auth/google` cobrem os escopos de sheets-route e
// oauth-route, onde o gate antes não existia (cada controller registrava só o
// authenticationMiddleware por conta própria).
const rotasGateadas = [
  "/user/find/all",
  "/permissoes",
  "/sessao/all",
  "/preparo/all",
  "/vegetal/all",
  "/lenha/all",
  "/mariri/all",
  "/chacrona/all",
  "/nucleo",
  "/sheets",
  "/auth/status",
  "/auth/google",
];

const semAcesso = {
  grau: null,
  cargos: null,
  cargoCodigo: null,
  bypass: false,
};

const usuarioSemCargo = {
  id: "user-1",
  email: "maria@example.com",
  nome: "Maria Silva",
  senha: null,
  cargoNome: null,
  integracoesAtivo: false,
  ...semAcesso,
  nucleo: {
    id: "nucleo-1",
    nome: "Núcleo A",
    estoqueAtivo: false,
    regioes: null,
  },
  permissoes: [],
};

function comToken(url: string, method: "GET" | "DELETE" = "GET") {
  const token = app.jwt.sign({ userId: "user-1" }, { expiresIn: "1h" });
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("gate de acesso nas rotas protegidas", () => {
  beforeEach(async () => {
    await app.ready();
    usuariosFindUnique.mockReset();
    usuariosFindUniqueOrThrow.mockReset();
    permissoesFindMany.mockReset();
    usuariosFindUnique.mockResolvedValue(semAcesso);
    usuariosFindUniqueOrThrow.mockResolvedValue(usuarioSemCargo);
    permissoesFindMany.mockResolvedValue([]);
  });

  it.each(rotasGateadas)(
    "%s responde 403 'Sem acesso ao aplicativo' para quem não tem cargo",
    async (url) => {
      const response = await comToken(url);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: "Sem acesso ao aplicativo" });
    },
  );

  it("DELETE /sheets/:title também é gateado — escrita em planilha não é só 'estar logado'", async () => {
    const response = await comToken("/sheets/Plantio", "DELETE");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Sem acesso ao aplicativo" });
  });

  it.each(["/sheets", "/auth/status", "/auth/google"])(
    "%s continua exigindo autenticação (401 sem token) depois do middleware sair do controller",
    async (url) => {
      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(401);
    },
  );

  it("libera as rotas gateadas quando o usuário tem cargo 56 (LOCAL, sem permissões)", async () => {
    usuariosFindUnique.mockResolvedValue({ ...semAcesso, cargoCodigo: "56" });

    const response = await comToken("/permissoes");

    // Status real do handler, não um `not.toBe(403)` que um 401/500 satisfaria:
    // prova que a request passou pelo authenticationMiddleware E pelo gate.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    expect(permissoesFindMany).toHaveBeenCalled();
  });

  it("GET /auth/google/callback fica FORA do gate — quem chama é o Google, sem JWT", async () => {
    // Sem Authorization nenhum: se o gate (ou o authenticationMiddleware)
    // estivesse nesse escopo, o Google levaria 401/403 e o OAuth quebraria.
    const response = await app.inject({
      method: "GET",
      url: "/auth/google/callback?state=abc",
    });

    // Sem `code`, o callback redireciona pro app com erro — mas redireciona,
    // ou seja, chegou no handler.
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("error=no_code");
    expect(usuariosFindUnique).not.toHaveBeenCalled();
  });

  it("GET /user/find/me fica FORA do gate — é a base da tela de acesso pendente", async () => {
    const response = await comToken("/user/find/me");

    expect(response.statusCode).toBe(201);
    expect(response.json().acessoLiberado).toBe(false);
    // O gate nem consulta o usuário nesta rota.
    expect(usuariosFindUnique).not.toHaveBeenCalled();
  });
});

afterAll(async () => {
  await app.close();
});
