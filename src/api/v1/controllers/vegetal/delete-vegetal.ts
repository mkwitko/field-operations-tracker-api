import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { assertOwnNucleo } from "../../services/authorization/assert-own-nucleo";
import { VegetalModel } from "../../models/vegetal-model";
import { vegetalResponse } from "./create-vegetal";

const vegetalModel = new VegetalModel();

export async function deleteVegetalRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete(
    "/vegetal/:id",
    {
      schema: {
        tags: ["Vegetal"],
        summary: "Delete Vegetal",
        params: z.object({ id: z.string() }),
        querystring: z.object({ soft: z.boolean().optional() }),
        response: { 200: vegetalResponse },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { soft = true } = request.query;
      // Só exclui vegetal do próprio núcleo.
      const existing = await vegetalModel.findById(id);
      await assertOwnNucleo(request.user.userId, existing?.nucleosId ?? null);
      const vegetal = await vegetalModel.exclude(id, soft);
      return reply.status(200).send(vegetal);
    }
  );
}
