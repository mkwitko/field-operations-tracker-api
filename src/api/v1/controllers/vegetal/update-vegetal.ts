import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { assertOwnNucleo } from "../../services/authorization/assert-own-nucleo";
import { VegetalModel } from "../../models/vegetal-model";
import { tipoVegetalEnum, vegetalResponse } from "./create-vegetal";

const vegetalModel = new VegetalModel();

export const VegetalUpdateInputSchema = z.object({
  id: z.string(),
  nome: z.string().optional(),
  tipo: tipoVegetalEnum.optional(),
  dataPreparo: z.string().optional(),
  mestrePreparo: z.string().optional(),
  observacoes: z.string().nullable().optional(),
  litrosEstoque: z.string().optional(),
  litrosGeladeira: z.string().optional(),
  deletado: z.boolean().optional(),
});

export async function updateVegetalRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/vegetal/update",
    {
      schema: {
        tags: ["Vegetal"],
        summary: "Update Vegetal",
        body: VegetalUpdateInputSchema,
        response: { 200: vegetalResponse },
      },
    },
    async (request, reply) => {
      // Só edita vegetal do próprio núcleo.
      const existing = await vegetalModel.findById(request.body.id);
      await assertOwnNucleo(request.user.userId, existing?.nucleosId ?? null);
      const vegetal = await vegetalModel.update(request.body);
      return reply.status(200).send(vegetal);
    }
  );
}
