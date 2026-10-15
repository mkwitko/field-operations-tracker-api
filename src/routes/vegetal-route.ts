import { createVegetalRoute } from "@/api/v1/controllers/vegetal/create-vegetal";
import { deleteVegetalRoute } from "@/api/v1/controllers/vegetal/delete-vegetal";
import { getAllVegetaisRoute } from "@/api/v1/controllers/vegetal/get-all-vegetais";
import { getVegetalByIdRoute } from "@/api/v1/controllers/vegetal/get-vegetal-by-id";
import { updateVegetalRoute } from "@/api/v1/controllers/vegetal/update-vegetal";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerVegetalRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    await createVegetalRoute(scoped);
    await updateVegetalRoute(scoped);
    await getVegetalByIdRoute(scoped);
    await getAllVegetaisRoute(scoped);
    await deleteVegetalRoute(scoped);
  });
}
