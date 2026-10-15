import { getAllNucleosRoute } from "@/api/v1/controllers/nucleos/get-all-nucleos";
import { getNucleoByIdRoute } from "@/api/v1/controllers/nucleos/get-nucleo-by-id";
import { getNucleoByRegionIdRoute } from "@/api/v1/controllers/nucleos/get-nucleo-by-region";
import { getPublicNucleosRoute } from "@/api/v1/controllers/nucleos/get-public-nucleos";
import { updateNucleoConfigRoute } from "@/api/v1/controllers/nucleos/update-nucleo-config";
import { getAllRegioes } from "@/api/v1/controllers/regioes/get-all-regioes";
import { getRegion } from "@/api/v1/controllers/regioes/get-region-by-id";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerNucleosRoutes(app: FastifyInstance) {
  // Pré-login: alimenta o picker de núcleo do signup.
  getPublicNucleosRoute(app);

  // Núcleos e regiões são provisionados no login via Cognito — só leitura.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    getNucleoByIdRoute(scoped);
    getNucleoByRegionIdRoute(scoped);
    getAllNucleosRoute(scoped);
    getAllRegioes(scoped);
    getRegion(scoped);
    updateNucleoConfigRoute(scoped);
  });
}
