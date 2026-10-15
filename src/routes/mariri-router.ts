import { createMaririRoute } from "@/api/v1/controllers/mariri/create-mariri";
import { deleteMaririRoute } from "@/api/v1/controllers/mariri/delete-mariri";
import { getAllMaririsRoute } from "@/api/v1/controllers/mariri/get-all-mariris";
import { getMaririByIdRoute } from "@/api/v1/controllers/mariri/get-mariri-by-id";
import { updateMaririRoute } from "@/api/v1/controllers/mariri/update-mariri";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function registerMaririRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    await createMaririRoute(scoped);
    await updateMaririRoute(scoped);
    await getMaririByIdRoute(scoped);
    await getAllMaririsRoute(scoped);
    await deleteMaririRoute(scoped);
  });
}
