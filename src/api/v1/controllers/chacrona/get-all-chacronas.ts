import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ChacronaModel } from "../../models/chacrona-model";
import { z } from "zod";
import { chacronaResponse } from "./create-chacrona";

const chacronaModel = new ChacronaModel();

export async function getAllChacronasRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/chacrona", {
    schema: {
      tags: ["Chacrona"],
      summary: "Get all Chacronas",
      response: { 200: z.array(chacronaResponse) },
    },
  }, async (_, reply) => {
    const chacronas = await chacronaModel.findAll();
    return reply.status(200).send(chacronas);
  });
}
