import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PreparosModel } from "../../models/preparos-model";
import { assertOwnNucleo } from "../../services/authorization/assert-own-nucleo";
import z from "zod";

const preparosModel = new PreparosModel();

export const PreparosUpdateInputSchema = z.object({
  id: z.string(),
  inicio: z.string(),
  fim: z.string(),
  producaoLitros: z.string(),
  nucleosId: z.string(),
  mariri: z.object({
    id: z.string(),
    pesoKg: z.string(),
    unidades: z.string(),
    tipo: z.string(),
    tipoPlantacao: z.string(),
    origemMensagem: z.string(),
  }),
  chacrona: z.object({
    id: z.string(),
    pesoKg: z.string(),
    unidades: z.string(),
    tipoPlantacao: z.string(),
    origemMensagem: z.string(),
  }),
  lenha: z.object({
    id: z.string(),
    quantidadeM2: z.string(),
    tempoFornalhaAcesa: z.string(),
    tipoLenha: z.string(),
    tipoFornalha: z.string(),
  }),
});

export async function updatePreparoRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/preparo/update",
    {
      schema: {
        tags: ["Preparos"],
        summary: "Update Preparo",
        operationId: "updatePreparo",
        body: PreparosUpdateInputSchema,
        response: {
          200: z.object({
            id: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Só edita registro do próprio núcleo.
      const existing = await preparosModel.findById(request.body.id);
      await assertOwnNucleo(
        request.user.userId,
        existing?.nucleosId ?? null,
      );
      const preparo = await preparosModel.update(request.body);
      return reply.status(200).send(preparo);
    }
  );
}
