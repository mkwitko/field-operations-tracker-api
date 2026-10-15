import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import z from "zod";

export const CleanupResponseSchema = z.object({
  message: z.string(),
  deleted: z.number(),
});

export async function cleanupExpiredTokens(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete(
    "/auth/cleanup",
    {
      schema: {
        tags: ["Auth"],
        summary: "Cleanup Expired Tokens",
        description: "Remove tokens expirados do banco de dados (admin only)",
        operationId: "cleanupExpiredTokens",
        response: {
          200: CleanupResponseSchema,
          500: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await prisma.googleTokens.deleteMany({
          where: {
            expiryDate: {
              lt: new Date(),
            },
          },
        });

        request.log.info(`Cleaned up ${result.count} expired tokens`);

        return reply.status(200).send({
          message: "Tokens expirados removidos com sucesso",
          deleted: result.count,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          error: "Falha ao limpar tokens expirados",
          message: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }
  );
}
