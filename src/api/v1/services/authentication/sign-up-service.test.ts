import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("prisma/db", () => ({
  prisma: {
    nucleos: { findFirst: (a: unknown) => findFirst(a) },
    usuarios: {
      findUnique: (a: unknown) => findUnique(a),
      upsert: (a: unknown) => upsert(a),
    },
  },
}));

import { compare } from "bcryptjs";
import { BadRequestError } from "@/errors/bad-request-error";
import { ConflictError } from "@/errors/conflict-error";
import { signUpService } from "./sign-up-service";

const params = {
  nome: "Maria Silva",
  email: "maria@example.com",
  senha: "senha12345",
  nucleoId: "nucleo-1",
};

describe("signUpService", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findUnique.mockReset();
    upsert.mockReset();
    findFirst.mockResolvedValue({ id: "nucleo-1" });
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({ id: "user-1" });
  });

  it("rejeita núcleo inexistente sem gravar nada", async () => {
    findFirst.mockResolvedValue(null);

    await expect(signUpService(params)).rejects.toBeInstanceOf(BadRequestError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejeita email que já tem senha cadastrada", async () => {
    findUnique.mockResolvedValue({ id: "user-1", senha: "$2a$10$hashexistente" });

    const promise = signUpService(params);

    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await expect(promise).rejects.toThrow("Email já cadastrado. Faça login.");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("grava hash bcrypt da senha, nunca o texto puro", async () => {
    await signUpService(params);

    const { create, update } = upsert.mock.calls[0][0];

    expect(create.senha).not.toBe(params.senha);
    expect(create.senha).toMatch(/^\$2[aby]\$/);
    // O hash tem de casar com a senha enviada — um hash de outra string passaria
    // nas duas asserções acima.
    await expect(compare(params.senha, create.senha)).resolves.toBe(true);
    expect(update.senha).toBe(create.senha);
  });

  it("cria a conta sem cargo e com o núcleo escolhido", async () => {
    const result = await signUpService(params);

    const chamada = upsert.mock.calls[0][0];

    expect(chamada.where).toEqual({ email: "maria@example.com" });
    expect(chamada.create).toMatchObject({
      email: "maria@example.com",
      nome: "Maria Silva",
      cargos: null,
      cargoNome: null,
      cargoCodigo: null,
      grau: null,
      nucleo: { connect: { id: "nucleo-1" } },
    });
    // Sem verificação de email no cadastro local: o app vai direto para o login.
    expect(result).toEqual({ userConfirmed: true });
  });

  it("reaproveita a linha sem senha zerando cargo e permissões do dono anterior", async () => {
    findUnique.mockResolvedValue({ id: "user-1", senha: null });

    await signUpService(params);

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      cargos: null,
      cargoNome: null,
      cargoCodigo: null,
      grau: null,
      permissoes: { set: [] },
    });
  });
});
