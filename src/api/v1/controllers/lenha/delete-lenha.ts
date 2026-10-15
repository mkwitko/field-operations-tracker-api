import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { LenhaModel } from "../../models/lenha-model";
import { z } from "zod";
import { lenhaResponse } from "./create-lenha";

const lenhaModel = new LenhaModel();

export async function deleteLenhaRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete("/lenha/:id", {
    schema: {
      tags: ["Lenha"],
      summary: "Delete Lenha",
      params: z.object({ id: z.string() }),
      querystring: z.object({ soft: z.boolean().optional() }),
      response: { 200: lenhaResponse },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { soft = true } = request.query;
    const lenha = await lenhaModel.exclude(id, soft);
    return reply.status(200).send(lenha);
  });
}
