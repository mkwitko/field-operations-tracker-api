import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "prisma/db";

export async function getAllPermissoes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/permissoes",
    {
      schema: {
        tags: ["Permissoes"],
        summary: "Get all Permissoes",
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
            }),
          ),
        },
      },
    },
    async (_, reply) => {
      const permissoes = await prisma.permissoes.findMany({
        select: {
          id: true,
          name: true,
        },
      });
      return reply.status(200).send(permissoes);
    },
  );
}
