import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { LenhaModel } from "../../models/lenha-model";
import { z } from "zod";
import { lenhaResponse } from "./create-lenha";

const lenhaModel = new LenhaModel();

export async function getLenhaByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/lenha/:id", {
    schema: {
      tags: ["Lenha"],
      summary: "Get Lenha by ID",
      params: z.object({ id: z.string() }),
      response: {
        200: lenhaResponse,
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const lenha = await lenhaModel.findById(request.params.id);
    if (!lenha) return reply.status(404).send({ message: "Lenha not found" });
    return reply.status(200).send(lenha);
  });
}
