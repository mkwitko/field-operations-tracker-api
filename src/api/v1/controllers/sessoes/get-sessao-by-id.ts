import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { SessoesModel } from "../../models/sessoes-model";
import { sessoesResponse } from "./create-sessao";

const sessoesModel = new SessoesModel();

export async function getSessaoByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/sessao/:id",
    {
      schema: {
        tags: ["Sessoes"],
        summary: "Get Sessao by ID",
        params: z.object({ id: z.string() }),
        response: {
          200: sessoesResponse,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const sessao = await sessoesModel.findById(request.params.id);
      if (!sessao) return reply.status(404).send({ message: "Sessao not found" });
      return reply.status(200).send(sessao);
    }
  );
}
