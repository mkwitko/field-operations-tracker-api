import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { MaririModel } from "../../models/mariri-model";
import { z } from "zod";

const maririModel = new MaririModel();

export const MaririCreateInputSchema = z.object({
  pesoKg: z.string(),
  unidades: z.string(),
  tipo: z.string(),
  tipoPlantacao: z.string(),
  origemMensagem: z.string(),
});

// 👇 exportado daqui
export const maririResponse = z.object({
  id: z.string(),
  pesoKg: z.string(),
  unidades: z.string(),
  tipo: z.string(),
  tipoPlantacao: z.string(),
  origemMensagem: z.string(),
});

export async function createMaririRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post("/mariri/create", {
    schema: {
      tags: ["Mariri"],
      summary: "Create Mariri",
      body: MaririCreateInputSchema,
      response: { 201: maririResponse },
    },
  }, async (request, reply) => {
    const mariri = await maririModel.create(request.body);
    return reply.status(201).send(mariri);
  });
}
