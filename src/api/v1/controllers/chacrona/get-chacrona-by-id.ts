import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ChacronaModel } from "../../models/chacrona-model";
import { z } from "zod";
import { chacronaResponse } from "./create-chacrona";

const chacronaModel = new ChacronaModel();

export async function getChacronaByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/chacrona/:id", {
    schema: {
      tags: ["Chacrona"],
      summary: "Get Chacrona by ID",
      params: z.object({ id: z.string() }),
      response: {
        200: chacronaResponse,
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const chacrona = await chacronaModel.findById(request.params.id);
    if (!chacrona) return reply.status(404).send({ message: "Chacrona not found" });
    return reply.status(200).send(chacrona);
  });
}
