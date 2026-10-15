import { createPreparoRoute } from "@/api/v1/controllers/preparos/create-preparo";
import { deletePreparoRoute } from "@/api/v1/controllers/preparos/delete-preparo";
import { getAllPreparosRoute } from "@/api/v1/controllers/preparos/get-all-preparos";
import { getPreparoByIdRoute } from "@/api/v1/controllers/preparos/get-preparo-by-id";
import { updatePreparoRoute } from "@/api/v1/controllers/preparos/update-preparo";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerPreparosRoutes(app: FastifyInstance) {
  // Todas exigem autenticação. Escopo de dados gateado em get-all-preparos.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    createPreparoRoute(scoped);
    updatePreparoRoute(scoped);
    getPreparoByIdRoute(scoped);
    getAllPreparosRoute(scoped);
    deletePreparoRoute(scoped);
  });
}
