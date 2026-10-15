import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { UsuariosModel } from "../../models/usuarios-model";

const usuariosModel = new UsuariosModel();

export const UserConfigSchema = z.object({
  integracoesAtivo: z.boolean().optional(),
});

export async function updateUserConfigRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/user/config",
    {
      schema: {
        tags: ["User"],
        summary: "Update User Config",
        description: "Atualiza as funcionalidades opcionais do próprio usuário.",
        operationId: "updateUserConfig",
        body: UserConfigSchema,
        response: {
          200: z.object({
            id: z.string(),
            integracoesAtivo: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const updated = await usuariosModel.updateConfig(
        request.user.userId,
        request.body
      );
      return reply.status(200).send(updated);
    }
  );
}
