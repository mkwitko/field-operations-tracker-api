import { afterAll, describe, expect, it, vi } from "vitest";

// O app real é montado aqui (src/app.ts), então tudo que ele toca no import
// precisa de mock: env (valida .env e derruba o processo), o pool do Cognito
// (instanciado no topo de cognito-service.ts) e o Prisma (conexão de banco).
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
      EXPO_SCHEME: "udvplantio",
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
    usuarios: {},
    nucleos: {},
    regioes: {},
  },
}));

import { app } from "./app";

// No topo, e não dentro do describe: o app é único no módulo e fechá-lo no fim
// de um describe deixaria qualquer describe seguinte sem app.
afterAll(async () => {
  await app.close();
});

describe("errorHandler — falha de validação de schema", () => {
  it("responde 400 com message e errors por campo quando o body é inválido", async () => {
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/authentication/sign/up",
      payload: {
        nome: "Ma", // min(3)
        email: "nao-e-email", // email()
        senha: "123", // min(8)
        confirmarSenha: "123",
        // nucleoId ausente
      },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.message).toBe("Erro de validação");
    expect(body.errors).toEqual({
      nome: ["Informe seu nome completo"],
      email: ["Invalid email"],
      senha: ["Mínimo 8 caracteres"],
      nucleoId: ["Required"],
    });
  });

  it("agrupa a mensagem do refine no campo apontado pelo path", async () => {
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/authentication/sign/up",
      payload: {
        nome: "Maria Silva",
        email: "maria@example.com",
        senha: "senha12345",
        confirmarSenha: "outra-senha",
        nucleoId: "ckpqzv1sv0000i8mm0i2m0h0a",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Erro de validação",
      errors: { confirmarSenha: ["As senhas não conferem"] },
    });
  });
});
