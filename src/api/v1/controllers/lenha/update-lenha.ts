import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { LenhaModel } from "../../models/lenha-model";
import { lenhaResponse } from "./create-lenha";
import z from "zod";

const lenhaModel = new LenhaModel();

export const LenhaUpdateInputSchema = z.object({
  id: z.string(),
  quantidadeM2: z.string().optional(),
  tempoFornalhaAcesa: z.string().optional(),
  tipoLenha: z.string().optional(),
  tipoFornalha: z.string().optional(),
  deletado: z.boolean().optional(),
  deletadoEm: z.date().optional(),
});


export async function updateLenhaRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put("/lenha/update", {
    schema: {
      tags: ["Lenha"],
      summary: "Update Lenha",
      body: LenhaUpdateInputSchema,
      response: { 200: lenhaResponse },
    },
  }, async (request, reply) => {
    const lenha = await lenhaModel.update(request.body);
    return reply.status(200).send(lenha);
  });
}
