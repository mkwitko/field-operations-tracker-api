import { getAcessoLiberado } from "@/api/v1/services/authorization/get-acesso-liberado";
import { ForbiddenError } from "@/errors/forbidden-error";
import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

/**
 * Exige que o usuário tenha acesso ao aplicativo (cargo reconhecido, grau QM ou
 * bypass) — o mesmo cálculo exposto em `acessoLiberado` no `/user/find/me`.
 *
 * Não dá para usar `requirePermission` como gate de entrada: o cargo 56
 * (Monitor do Plantio Local, escopo LOCAL) tem acesso e nenhuma permissão.
 *
 * Deve ser registrado DEPOIS do authenticationMiddleware (usa request.user).
 * `GET /user/find/me` fica de fora: é justamente o endpoint que o app consulta
 * para exibir a tela de acesso pendente.
 *
 * Uso: escopo.register(authenticationMiddleware).register(requireAcessoLiberado)
 */
export const requireAcessoLiberado = fastifyPlugin(
  async (app: FastifyInstance) => {
    app.addHook("preHandler", async (request) => {
      const userId = request.user?.userId;
      if (!userId) throw new ForbiddenError("Usuário não autenticado");

      const liberado = await getAcessoLiberado(userId);
      if (!liberado) {
        // Mesma mensagem que o login usava antes da Task 1 — o vocabulário de
        // erro do sistema não muda, só o ponto onde a barreira é aplicada.
        throw new ForbiddenError("Sem acesso ao aplicativo");
      }
    });
  },
);
