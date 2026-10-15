import { app } from "@/app";
import { authenticationRoute } from "./authentication-route";
import { registerChacronaRoutes } from "./chacrona-route";
import { registerLenhaRoutes } from "./lenha-router";
import { registerMaririRoutes } from "./mariri-router";
import { registerNucleosRoutes } from "./nucleos-route";
import { oauthroute } from "./oauth-route";
import { registerPreparosRoutes } from "./preparos-route";
import { registerSessoesRoutes } from "./sessoes-route";
import { registerVegetalRoutes } from "./vegetal-route";
import { sheetsRoute } from "./sheets-route";
import { userRoute } from "./user-route";
import { getAllPermissoes } from "@/api/v1/controllers/permissoes/get-all-permissoes";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";

export default async function Routing() {
  // Liveness probe (public, no auth) — used by proxy/uptime checks
  app.get("/health", async (_req, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  authenticationRoute(app);
  userRoute(app);

  app.register(registerChacronaRoutes);
  app.register(registerLenhaRoutes);
  app.register(registerMaririRoutes);
  app.register(registerNucleosRoutes);
  app.register(registerPreparosRoutes);
  app.register(registerSessoesRoutes);
  app.register(registerVegetalRoutes);
  app.register(sheetsRoute);
  app.register(oauthroute);

  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    getAllPermissoes(scoped);
  });
}
