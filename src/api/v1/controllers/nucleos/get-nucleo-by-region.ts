import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import z from "zod";
import { nucleosResponse } from "./nucleo-response";

export async function getNucleoByRegionIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/nucleo/region/:id",
    {
      schema: {
        tags: ["Nucleos"],
        summary: "Get Nucleo by Region ID",
        description: "Retrieve a Nucleo by its Region ID",
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: z.array(nucleosResponse),
        },
      },
    },
    async (request, response) => {
      const nucleos = await prisma.nucleos.findMany({
        where: { regioesId: request.params.id },
        include: { regioes: true },
      });
      return response.status(200).send(nucleos);
    }
  );
}
