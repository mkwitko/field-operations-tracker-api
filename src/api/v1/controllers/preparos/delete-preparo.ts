import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { PreparosModel } from "../../models/preparos-model";
import { assertOwnNucleo } from "../../services/authorization/assert-own-nucleo";

const preparosModel = new PreparosModel();

export async function deletePreparoRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete(
    "/preparo/:id",
    {
      schema: {
        tags: ["Preparos"],
        summary: "Delete Preparo",
        operationId: "deletePreparo",
        params: z.object({ id: z.string() }),
        querystring: z.object({ soft: z.boolean().optional() }),
        response: {
          200: z.object({
            id: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { soft = false } = request.query;

      // Só exclui registro do próprio núcleo.
      const existing = await preparosModel.findById(id);
      await assertOwnNucleo(request.user.userId, existing?.nucleosId ?? null);
      const preparo = await preparosModel.exclude(id, soft);
      return reply.status(200).send(preparo);
    }
  );
}
