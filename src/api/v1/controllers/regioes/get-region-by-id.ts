import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import { z } from "zod";

export async function getRegion(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/regions/find",
    {
      schema: {
        tags: ["Regioes"],
        summary: "Get a Region by ID",
        operationId: "getRegionById",
        querystring: z.object({
          id: z.string(),
        }),
        response: {
          200: z
            .object({
              id: z.string(),
              nome: z.string(),
            })
            .nullable(),
        },
      },
    },
    async (request, reply) => {
      const regiao = await prisma.regioes.findUnique({
        where: { id: request.query.id },
      });
      return reply.status(200).send(regiao);
    },
  );
}
