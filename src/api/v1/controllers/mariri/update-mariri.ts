import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { MaririModel } from "../../models/mariri-model";
import { maririResponse } from "./create-mariri";
import z from "zod";

const maririModel = new MaririModel();

export const MaririUpdateInputSchema = z.object({
  id: z.string(),
  pesoKg: z.string().optional(),
  unidades: z.string().optional(),
  tipo: z.string().optional(),
  tipoPlantacao: z.string().optional(),
  origemMensagem: z.string().optional(),
  deletado: z.boolean().optional(),
  deletadoEm: z.date().optional(),
});

export async function updateMaririRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put("/mariri/update", {
    schema: {
      tags: ["Mariri"],
      summary: "Update Mariri",
      body: MaririUpdateInputSchema,
      response: { 200: maririResponse },
    },
  }, async (request, reply) => {
    const mariri = await maririModel.update(request.body);
    return reply.status(200).send(mariri);
  });
}
