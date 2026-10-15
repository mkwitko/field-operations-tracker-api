import { beforeEach, describe, expect, it, vi } from "vitest";

const cognitoSignIn = vi.fn();
const usuariosUpsert = vi.fn();
const usuariosFindUniqueOrThrow = vi.fn();
const regioesFindFirst = vi.fn();
const nucleosFindFirst = vi.fn();

const usuariosFindUnique = vi.fn();

vi.mock("prisma/db", () => ({
  prisma: {
    usuarios: {
      upsert: (args: unknown) => usuariosUpsert(args),
      findUniqueOrThrow: (args: unknown) => usuariosFindUniqueOrThrow(args),
      findUnique: (args: unknown) => usuariosFindUnique(args),
    },
    regioes: {
      findFirst: (args: unknown) => regioesFindFirst(args),
      create: vi.fn(),
    },
    nucleos: {
      findFirst: (args: unknown) => nucleosFindFirst(args),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// `cognito-service.ts` instancia `new CognitoUserPool(...)` no import; mockar o
// módulo inteiro evita rede e credencial.
vi.mock("./cognito-service", () => ({
  cognitoSignIn: (args: unknown) => cognitoSignIn(args),
}));

vi.mock("@/env", () => ({
  env: {
    ENVIRONMENT: "production",
    BYPASS_EMAILS: "",
    MOCK_ENABLED: "false",
    MOCK_BYPASS: "true",
  },
}));

import { hash } from "bcryptjs";
import { BadRequestError } from "@/errors/bad-request-error";
import { EmailNaoConfirmadoError } from "@/errors/email-nao-confirmado-error";
import { authenticationService } from "./authentication-service";

// Quem acabou de se cadastrar: o Cognito confirma a credencial, mas ainda não
// tem cargo, grau nem núcleo nas claims (isso vem do Mural Digital).
const claimsSemCargo = {
  email: "maria@example.com",
  nome: "Maria Silva",
  cargos: null,
  cargoNome: null,
  cargoCodigo: null,
  grau: null,
  nucleoNome: null,
  regiaoNome: null,
};

const usuarioPersistido = {
  id: "user-1",
  email: "maria@example.com",
  nome: "Maria Silva",
  senha: null,
  cargos: null,
  cargoNome: null,
  cargoCodigo: null,
  grau: null,
  bypass: false,
  nucleo: { id: "nucleo-1", nome: "Núcleo A", estoqueAtivo: false, regioes: null },
  permissoes: [],
};

describe("authenticationService", () => {
  beforeEach(() => {
    cognitoSignIn.mockReset();
    usuariosUpsert.mockReset();
    usuariosFindUnique.mockReset();
    usuariosFindUniqueOrThrow.mockReset();
    regioesFindFirst.mockReset();
    nucleosFindFirst.mockReset();

    cognitoSignIn.mockResolvedValue(claimsSemCargo);
    usuariosUpsert.mockResolvedValue({ id: "user-1" });
    usuariosFindUniqueOrThrow.mockResolvedValue(usuarioPersistido);
  });

  it("autentica quem não tem cargo nem grau (o token é emitido, antes era 403)", async () => {
    // O gate deixou de ser o login: o controller assina o token a partir deste
    // retorno, e o app decide a tela pelo `acessoLiberado` do /user/find/me. Se
    // alguém reintroduzir o 403 aqui, a tela de acesso pendente para de existir.
    const { user } = await authenticationService({
      email: "maria@example.com",
      password: "senha12345",
    });

    expect(user.id).toBe("user-1");
    expect(user.grau).toBeNull();
    expect(user.cargos).toBeNull();

    // E o usuário é provisionado sem nenhuma permissão.
    const args = usuariosUpsert.mock.calls[0][0];
    expect(args.create.permissoes).toEqual({ connect: [] });
    expect(args.update.permissoes).toEqual({ set: [] });
  });

  it("preserva o nucleoId do signup quando as claims não trazem custom:nucleo_nome", async () => {
    // `syncFromCognito` só inclui a chave `nucleo` no payload quando há núcleo
    // vindo do Cognito. Um `connect: null` (ou `nucleo: undefined` explícito
    // virando disconnect) apagaria o núcleo escolhido no cadastro.
    await authenticationService({
      email: "maria@example.com",
      password: "senha12345",
    });

    expect(nucleosFindFirst).not.toHaveBeenCalled();
    expect(regioesFindFirst).not.toHaveBeenCalled();

    const args = usuariosUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ email: "maria@example.com" });
    expect(args.create).not.toHaveProperty("nucleo");
    expect(args.update).not.toHaveProperty("nucleo");
  });

  it("conecta o núcleo quando a claim custom:nucleo_nome existe", async () => {
    // Contraprova do caso acima: com a claim, o núcleo do Cognito vence.
    cognitoSignIn.mockResolvedValue({
      ...claimsSemCargo,
      grau: "QM",
      nucleoNome: "Núcleo B",
    });
    nucleosFindFirst.mockResolvedValue({ id: "nucleo-2", regioesId: null });

    await authenticationService({
      email: "maria@example.com",
      password: "senha12345",
    });

    const args = usuariosUpsert.mock.calls[0][0];
    expect(args.update.nucleo).toEqual({ connect: { id: "nucleo-2" } });
  });

  describe("cadastro local (senha no nosso banco)", () => {
    const credencialInvalida = { code: "NotAuthorizedException" };

    it("autentica pelo hash bcrypt quando o Cognito não conhece o email", async () => {
      cognitoSignIn.mockRejectedValue(credencialInvalida);
      usuariosFindUnique.mockResolvedValue({
        id: "user-1",
        senha: await hash("senha12345", 10),
      });

      const { user } = await authenticationService({
        email: "maria@example.com",
        password: "senha12345",
      });

      expect(user.id).toBe("user-1");
      // Nada de sincronizar cargo: não há claims para aplicar.
      expect(usuariosUpsert).not.toHaveBeenCalled();
    });

    it("recusa senha errada com a mesma mensagem do Cognito", async () => {
      cognitoSignIn.mockRejectedValue(credencialInvalida);
      usuariosFindUnique.mockResolvedValue({
        id: "user-1",
        senha: await hash("senha12345", 10),
      });

      const promise = authenticationService({
        email: "maria@example.com",
        password: "senha-errada",
      });

      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
      await expect(promise).rejects.toThrow("Credenciais inválidas");
    });

    it("recusa quem não tem senha local (provisionado pelo Cognito)", async () => {
      // Sem este guard, o compare rodaria contra hash nulo/vazio.
      cognitoSignIn.mockRejectedValue(credencialInvalida);
      usuariosFindUnique.mockResolvedValue({ id: "user-1", senha: null });

      await expect(
        authenticationService({ email: "maria@example.com", password: "qualquer" }),
      ).rejects.toThrow("Credenciais inválidas");
    });

    it("recusa email que não existe em lugar nenhum", async () => {
      cognitoSignIn.mockRejectedValue(credencialInvalida);
      usuariosFindUnique.mockResolvedValue(null);

      await expect(
        authenticationService({ email: "ninguem@example.com", password: "qualquer" }),
      ).rejects.toThrow("Credenciais inválidas");
    });

    it("não tenta senha local quando o email do Cognito falta confirmar", async () => {
      // Cair no fallback aqui esconderia a tela do código de confirmação.
      cognitoSignIn.mockRejectedValue(new EmailNaoConfirmadoError());

      await expect(
        authenticationService({ email: "maria@example.com", password: "senha12345" }),
      ).rejects.toBeInstanceOf(EmailNaoConfirmadoError);
      expect(usuariosFindUnique).not.toHaveBeenCalled();
    });
  });
});
