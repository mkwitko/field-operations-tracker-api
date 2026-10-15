import { createLenhaRoute } from "@/api/v1/controllers/lenha/create-lenha";
import { deleteLenhaRoute } from "@/api/v1/controllers/lenha/delete-lenha";
import { getAllLenhasRoute } from "@/api/v1/controllers/lenha/get-all-lenhas";
import { getLenhaByIdRoute } from "@/api/v1/controllers/lenha/get-lenha-by-id";
import { updateLenhaRoute } from "@/api/v1/controllers/lenha/update-lenha";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerLenhaRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    await createLenhaRoute(scoped);
    await updateLenhaRoute(scoped);
    await getLenhaByIdRoute(scoped);
    await getAllLenhasRoute(scoped);
    await deleteLenhaRoute(scoped);
  });
}
