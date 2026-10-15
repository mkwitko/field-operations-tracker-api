import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { NucleosModel } from "../../models/nucleos-model";
import { requireOwnNucleoId } from "../../services/authorization/assert-own-nucleo";

const nucleosModel = new NucleosModel();

export const NucleoConfigSchema = z.object({
  estoqueAtivo: z.boolean().optional(),
});

export async function updateNucleoConfigRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/nucleo/config",
    {
      schema: {
        tags: ["Nucleos"],
        summary: "Update Nucleo Config",
        description: "Atualiza as funcionalidades opcionais do próprio núcleo.",
        operationId: "updateNucleoConfig",
        body: NucleoConfigSchema,
        response: {
          200: z.object({
            id: z.string(),
            estoqueAtivo: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Só configura o próprio núcleo.
      const nucleoId = await requireOwnNucleoId(request.user.userId);
      const updated = await nucleosModel.updateConfig(nucleoId, request.body);
      return reply.status(200).send(updated);
    }
  );
}
