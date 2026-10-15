import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { PreparosModel } from "../../models/preparos-model";
import { requireOwnNucleoId } from "../../services/authorization/assert-own-nucleo";

const preparosModel = new PreparosModel();

export const PreparosCreateInputSchema = z.object({
  inicio: z.string(),
  fim: z.string(),
  producaoLitros: z.string(),
  nucleosId: z.string().optional(),
  mariri: z
    .object({
      pesoKg: z.string(),
      unidades: z.string(),
      tipo: z.string(),
      tipoPlantacao: z.string(),
      origemMensagem: z.string(),
    })
    .optional(),
  chacrona: z
    .object({
      pesoKg: z.string(),
      unidades: z.string(),
      tipoPlantacao: z.string(),
      origemMensagem: z.string(),
    })
    .optional(),
  lenha: z
    .object({
      quantidadeM2: z.string(),
      tempoFornalhaAcesa: z.string(),
      tipoLenha: z.string(),
      tipoFornalha: z.string(),
    })
    .optional(),
});

export const preparosResponse = z.object({
  id: z.string(),
  inicio: z.date(),
  fim: z.date(),
  producaoLitros: z.string(),
  nucleosId: z.string().nullable().optional(),
  Nucleos: z
    .object({
      nome: z.string(),
      regioes: z
        .object({
          nome: z.string(),
        })
        .nullable(),
    })
    .nullable(),
  mariri: z
    .object({
      id: z.string(),
      pesoKg: z.string(),
      unidades: z.string(),
      tipo: z.string(),
      tipoPlantacao: z.string(),
      origemMensagem: z.string(),
    })
    .nullable(),
  chacrona: z
    .object({
      id: z.string(),
      pesoKg: z.string(),
      unidades: z.string(),
      tipoPlantacao: z.string(),
      origemMensagem: z.string(),
    })
    .nullable(),
  lenha: z
    .object({
      id: z.string(),
      quantidadeM2: z.string(),
      tempoFornalhaAcesa: z.string(),
      tipoLenha: z.string(),
      tipoFornalha: z.string(),
    })
    .nullable(),
});

export async function createPreparoRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/preparo/create",
    {
      schema: {
        tags: ["Preparos"],
        summary: "Create Preparo",
        operationId: "createPreparo",
        body: PreparosCreateInputSchema,
        response: { 201: preparosResponse },
      },
    },
    async (request, reply) => {
      // Escrita só no próprio núcleo — ignora nucleosId do body.
      const nucleosId = await requireOwnNucleoId(request.user.userId);
      const preparo = await preparosModel.create({ ...request.body, nucleosId });
      return reply.status(201).send(preparo);
    }
  );
}
