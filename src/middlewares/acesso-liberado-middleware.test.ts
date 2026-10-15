import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("prisma/db", () => ({
  prisma: {
    usuarios: { findUnique: (args: unknown) => findUnique(args) },
  },
}));

import { ForbiddenError } from "@/errors/forbidden-error";
import { fastify } from "fastify";
import { requireAcessoLiberado } from "./acesso-liberado-middleware";

/**
 * Fastify de verdade com uma rota protegida — o hook, o helper de consulta e o
 * cálculo de acesso rodam para valer; só o Prisma é mockado. Testar via
 * `app.inject()` evita que o teste apenas confirme o próprio mock.
 */
async function buildApp() {
  const app = fastify();

  // Simula o authenticationMiddleware: só popula request.user.
  app.addHook("preHandler", async (request) => {
    request.user = { userId: "user-1" };
  });

  app.register(requireAcessoLiberado);

  app.get("/protegida", async () => ({ ok: true }));

  app.setErrorHandler((error: Error, _request, reply) => {
    if (error instanceof ForbiddenError) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({ message: error.message });
  });

  await app.ready();
  return app;
}

const semAcesso = {
  grau: null,
  cargos: null,
  cargoCodigo: null,
  bypass: false,
};

async function chamarRotaProtegida() {
  const app = await buildApp();
  const response = await app.inject({ method: "GET", url: "/protegida" });
  await app.close();
  return response;
}

describe("requireAcessoLiberado", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("bloqueia com 403 'Sem acesso ao aplicativo' quem não tem cargo nem grau", async () => {
    findUnique.mockResolvedValue(semAcesso);

    const response = await chamarRotaProtegida();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Sem acesso ao aplicativo" });
  });

  it("bloqueia com 403 quando o usuário não existe mais", async () => {
    findUnique.mockResolvedValue(null);

    const response = await chamarRotaProtegida();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Sem acesso ao aplicativo" });
  });

  it("libera grau QM sem cargo", async () => {
    findUnique.mockResolvedValue({ ...semAcesso, grau: "QM" });

    const response = await chamarRotaProtegida();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("libera cargo 56 (LOCAL), que não concede nenhuma permissão", async () => {
    // Este é o caso que um gate por lista de permissões vazia quebraria:
    // MONITOR(A) DO PLANTIO LOCAL tem acesso e ESCOPO_PERMISSOES.LOCAL = [].
    findUnique.mockResolvedValue({ ...semAcesso, cargoCodigo: "56" });

    const response = await chamarRotaProtegida();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("libera bypass mesmo sem cargo e sem grau", async () => {
    findUnique.mockResolvedValue({ ...semAcesso, bypass: true });

    const response = await chamarRotaProtegida();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("consulta só os quatro campos de acesso do usuário logado", async () => {
    findUnique.mockResolvedValue({ ...semAcesso, bypass: true });

    await chamarRotaProtegida();

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        grau: true,
        cargos: true,
        cargoCodigo: true,
        bypass: true,
      },
    });
  });
});
