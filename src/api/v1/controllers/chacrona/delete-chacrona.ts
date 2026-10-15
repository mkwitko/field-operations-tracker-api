import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ChacronaModel } from "../../models/chacrona-model";
import { z } from "zod";
import { chacronaResponse } from "./create-chacrona";

const chacronaModel = new ChacronaModel();

export async function deleteChacronaRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete("/chacrona/:id", {
    schema: {
      tags: ["Chacrona"],
      summary: "Delete Chacrona",
      params: z.object({ id: z.string() }),
      querystring: z.object({ soft: z.boolean().optional() }),
      response: { 200: chacronaResponse },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { soft = true } = request.query;
    const chacrona = await chacronaModel.exclude(id, soft);
    return reply.status(200).send(chacrona);
  });
}
