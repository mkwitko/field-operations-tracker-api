import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ChacronaModel } from "../../models/chacrona-model";
import { chacronaResponse } from "./create-chacrona";
import z from "zod";

const chacronaModel = new ChacronaModel();

export const ChacronaUpdateInputSchema = z.object({
  id: z.string(),
  pesoKg: z.string().optional(),
  unidades: z.string().optional(),
  tipo: z.string().optional(),
  tipoPlantacao: z.string().optional(),
  origemMensagem: z.string().optional(),
  deletado: z.boolean().optional(),
  deletadoEm: z.date().optional(),
});

export async function updateChacronaRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put("/chacrona/update", {
    schema: {
      tags: ["Chacrona"],
      summary: "Update Chacrona",
      body: ChacronaUpdateInputSchema,
      response: { 200: chacronaResponse },
    },
  }, async (request, reply) => {
    const chacrona = await chacronaModel.update(request.body);
    return reply.status(200).send(chacrona);
  });
}
