import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { LenhaModel } from "../../models/lenha-model";
import { z } from "zod";

const lenhaModel = new LenhaModel();

export const LenhaCreateInputSchema = z.object({
  quantidadeM2: z.string(),
  tempoFornalhaAcesa: z.string(),
  tipoLenha: z.string(),
  tipoFornalha: z.string(),
});

// 👇 exportando aqui dentro
export const lenhaResponse = z.object({
  id: z.string(),
  quantidadeM2: z.string(),
  tempoFornalhaAcesa: z.string(),
  tipoLenha: z.string(),
  tipoFornalha: z.string(),
});

export async function createLenhaRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post("/lenha/create", {
    schema: {
      tags: ["Lenha"],
      summary: "Create Lenha",
      body: LenhaCreateInputSchema,
      response: { 201: lenhaResponse },
    },
  }, async (request, reply) => {
    const lenha = await lenhaModel.create(request.body);
    return reply.status(201).send(lenha);
  });
}
