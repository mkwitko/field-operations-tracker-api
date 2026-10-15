import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { SessoesModel } from "../../models/sessoes-model";
import { assertOwnNucleo } from "../../services/authorization/assert-own-nucleo";
import z from "zod";

const sessoesModel = new SessoesModel();

export async function deleteSessaoRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete(
    "/sessao/:id",
    {
      schema: {
        tags: ["Sessoes"],
        summary: "Delete Sessao",
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      // Só exclui registro do próprio núcleo.
      const existing = await sessoesModel.findById(id);
      await assertOwnNucleo(request.user.userId, existing?.nucleosId ?? null);
      const sessao = await sessoesModel.exclude(id);
      return reply.status(200).send(sessao);
    }
  );
}
