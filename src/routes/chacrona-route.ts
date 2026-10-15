import { createChacronaRoute } from "@/api/v1/controllers/chacrona/create-chacrona";
import { deleteChacronaRoute } from "@/api/v1/controllers/chacrona/delete-chacrona";
import { getAllChacronasRoute } from "@/api/v1/controllers/chacrona/get-all-chacronas";
import { getChacronaByIdRoute } from "@/api/v1/controllers/chacrona/get-chacrona-by-id";
import { updateChacronaRoute } from "@/api/v1/controllers/chacrona/update-chacrona";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerChacronaRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    createChacronaRoute(scoped);
    updateChacronaRoute(scoped);
    getChacronaByIdRoute(scoped);
    getAllChacronasRoute(scoped);
    deleteChacronaRoute(scoped);
  });
}
