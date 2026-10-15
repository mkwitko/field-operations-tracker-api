import { getUserPermissionNames } from "@/api/v1/services/authorization/get-user-permissions";
import { ForbiddenError } from "@/errors/forbidden-error";
import { hasAnyPermission } from "@/permissions";
import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

/**
 * Exige que o usuário tenha ao menos uma das permissões (ou ADMINISTRADOR).
 * Deve ser registrado DEPOIS do authenticationMiddleware (usa request.user).
 *
 * Uso: escopo.register(authenticationMiddleware).register(requirePermission(PERMISSIONS.CRIAR_NUCLEOS))
 */
export const requirePermission = (...required: string[]) =>
  fastifyPlugin(async (app: FastifyInstance) => {
    app.addHook("preHandler", async (request) => {
      const userId = request.user?.userId;
      if (!userId) throw new ForbiddenError("Usuário não autenticado");

      const names = await getUserPermissionNames(userId);
      if (!hasAnyPermission(names, required)) {
        throw new ForbiddenError();
      }
    });
  });
