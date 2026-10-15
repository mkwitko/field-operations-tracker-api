import { createSessaoRoute } from "@/api/v1/controllers/sessoes/create-sessao";
import { deleteSessaoRoute } from "@/api/v1/controllers/sessoes/delete-sessao";
import { getAllSessoesRoute } from "@/api/v1/controllers/sessoes/get-all-sessoes";
import { getSessaoByIdRoute } from "@/api/v1/controllers/sessoes/get-sessao-by-id";
import { updateSessaoRoute } from "@/api/v1/controllers/sessoes/update-sessao";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerSessoesRoutes(app: FastifyInstance) {
  // Todas exigem autenticação. Escopo de dados gateado em get-all-sessoes.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    await createSessaoRoute(scoped);
    await updateSessaoRoute(scoped);
    await getSessaoByIdRoute(scoped);
    await getAllSessoesRoute(scoped);
    await deleteSessaoRoute(scoped);
  });
}
