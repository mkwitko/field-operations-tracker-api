import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import { z } from "zod";

export async function getAllRegioes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/regions",
    {
      schema: {
        tags: ["Regioes"],
        summary: "Get all Regioes",
        operationId: "getAllRegioes",
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              nome: z.string(),
            })
          ),
        },
      },
    },
    async (_, reply) => {
      const regioes = await prisma.regioes.findMany({
        orderBy: { nome: "asc" },
      });
      return reply.status(200).send(regioes);
    }
  );
}
