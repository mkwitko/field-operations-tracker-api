import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import z from "zod";

export const LogoutResponseSchema = z.object({
  message: z.string(),
});

export async function logout(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>()
  .post(
    "/auth/logout",
    {
      schema: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Faz logout do usuário e remove a sessão",
        operationId: "logoutUser",
        response: {
          200: LogoutResponseSchema,
        },
      },
    },
    async (request, reply) => {
     const userId = request.user.userId;

      try {
        await prisma.googleTokens.delete({
          where: { usuarioId: userId },
        });

        return reply.status(200).send({
          message: "Logout realizado com sucesso",
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(200).send({
          message: "Logout realizado",
        });
      }
    }
  );
}