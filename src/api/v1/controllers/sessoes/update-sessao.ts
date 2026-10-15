import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { SessoesModel } from "../../models/sessoes-model";
import { assertOwnNucleo } from "../../services/authorization/assert-own-nucleo";
import { consumoVegetalSchema } from "./create-sessao";
import z from "zod";

const sessoesModel = new SessoesModel();

export const SessoesUpdateInputSchema = z.object({
  id: z.string(),
  sessao: z.string().optional(),
  descricao: z.string().nullable().optional(),
  data: z.string().optional(),
  pessoas: z.string().optional(),
  quantidadeVegetal: z.string().optional(),
  nucleosId: z.string().optional(),
  // Se enviado, substitui todos os consumos e reajusta saldos (revert + aplica).
  vegetais: z.array(consumoVegetalSchema).optional(),
  descontarEstoque: z.boolean().optional(),
  adicionarGeladeira: z.boolean().optional(),
});

export async function updateSessaoRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/sessao/update",
    {
      schema: {
        tags: ["Sessoes"],
        summary: "Update Sessao",
        body: SessoesUpdateInputSchema,
        response: {
          200: z.object({
            id: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Só edita registro do próprio núcleo; mantém o núcleo do usuário.
      const existing = await sessoesModel.findById(request.body.id);
      const nucleosId = await assertOwnNucleo(
        request.user.userId,
        existing?.nucleosId ?? null,
      );
      const sessao = await sessoesModel.update({ ...request.body, nucleosId });
      return reply.status(200).send(sessao);
    }
  );
}
