import { findMe } from "@/api/v1/controllers/usuarios/find-me";
import { findUserById } from "@/api/v1/controllers/usuarios/find-user-by-id";
import { findUsers } from "@/api/v1/controllers/usuarios/find-users";
import { updateUserConfigRoute } from "@/api/v1/controllers/usuarios/update-user-config";
import { requireAcessoLiberado } from "@/middlewares/acesso-liberado-middleware";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";
import type { FastifyInstance } from "fastify";

export async function userRoute(app: FastifyInstance) {
  // `/user/find/me` fica FORA do gate de acesso, em escopo próprio: é o
  // endpoint que devolve `acessoLiberado`, e a tela de acesso pendente do app
  // depende dele justamente para quem ainda não tem cargo. Barrar aqui deixaria
  // o usuário sem nenhuma resposta útil.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    findMe(scoped);
  });

  // Usuários são provisionados no login via Cognito — sem gestão manual.
  // Só leitura + config opcional do próprio usuário, e só com acesso liberado.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    scoped.register(requireAcessoLiberado);
    findUsers(scoped);
    findUserById(scoped);
    updateUserConfigRoute(scoped);
  });
}
