import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { NucleosModel } from "../../models/nucleos-model";

const nucleosModel = new NucleosModel();

export async function getPublicNucleosRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/public/nucleo",
    {
      schema: {
        tags: ["Nucleos"],
        summary: "Listar núcleos (público)",
        description:
          "Lista os núcleos existentes para o picker do signup. Sem autenticação.",
        operationId: "getPublicNucleos",
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              nome: z.string(),
              regiaoNome: z.string().nullable(),
            }),
          ),
        },
      },
    },
    async (_request, reply) => {
      const nucleos = await nucleosModel.findAllPublic();
      return reply.status(200).send(nucleos);
    },
  );
}
