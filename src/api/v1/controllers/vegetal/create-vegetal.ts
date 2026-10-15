import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireOwnNucleoId } from "../../services/authorization/assert-own-nucleo";
import { VegetalModel } from "../../models/vegetal-model";

const vegetalModel = new VegetalModel();

export const tipoVegetalEnum = z.enum(["caupuri", "tucunaca", "caupuri_tucunaca"]);

export const VegetalCreateInputSchema = z.object({
  nome: z.string(),
  tipo: tipoVegetalEnum,
  dataPreparo: z.string(),
  mestrePreparo: z.string(),
  observacoes: z.string().nullable().optional(),
  litrosEstoque: z.string().optional(),
  litrosGeladeira: z.string().optional(),
});

export const vegetalResponse = z.object({
  id: z.string(),
  nome: z.string(),
  tipo: z.string(),
  dataPreparo: z.string(),
  mestrePreparo: z.string(),
  observacoes: z.string().nullable().optional(),
  litrosEstoque: z.string(),
  litrosGeladeira: z.string(),
  deletado: z.boolean().optional(),
  nucleosId: z.string().nullable().optional(),
  Nucleos: z
    .object({
      nome: z.string(),
      regioes: z.object({ nome: z.string() }).nullable(),
    })
    .nullable()
    .optional(),
});

export async function createVegetalRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/vegetal/create",
    {
      schema: {
        tags: ["Vegetal"],
        summary: "Create Vegetal (estoque)",
        body: VegetalCreateInputSchema,
        response: { 201: vegetalResponse },
      },
    },
    async (request, reply) => {
      // Escrita só no próprio núcleo.
      const nucleosId = await requireOwnNucleoId(request.user.userId);
      const vegetal = await vegetalModel.create({ ...request.body, nucleosId });
      return reply.status(201).send(vegetal);
    }
  );
}
