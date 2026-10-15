import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ChacronaModel } from "../../models/chacrona-model";
import z from "zod";

const chacronaModel = new ChacronaModel();

export const ChacronaCreateInputSchema = z.object({
  pesoKg: z.string(),
  unidades: z.string(),
  tipo: z.string(),
  tipoPlantacao: z.string(),
  origemMensagem: z.string(),
});

export const chacronaResponse = z.object({
  id: z.string(),
  pesoKg: z.string(),
  unidades: z.string(),
  tipo: z.string(),
  tipoPlantacao: z.string(),
  origemMensagem: z.string(),
});

export async function createChacronaRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post("/chacrona/create", {
    schema: {
      tags: ["Chacrona"],
      summary: "Create Chacrona",
      body: ChacronaCreateInputSchema,
      response: { 201: chacronaResponse },
    },
  }, async (request, reply) => {
    const chacrona = await chacronaModel.create(request.body);
    return reply.status(201).send(chacrona);
  });
}
