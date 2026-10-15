import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { PreparosModel } from "../../models/preparos-model";
import { preparosResponse } from "./create-preparo";

const preparosModel = new PreparosModel();

export async function getPreparoByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/preparo/:id",
    {
      schema: {
        tags: ["Preparos"],
        summary: "Get Preparo by ID",
        operationId: "getPreparoById",
        params: z.object({ id: z.string() }),
        response: {
          200: preparosResponse,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const preparo = await preparosModel.findById(request.params.id);
      if (!preparo) return reply.status(404).send({ message: "Preparo not found" });
      return reply.status(200).send(preparo);
    }
  );
}
