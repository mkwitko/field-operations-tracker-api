import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { resolveViewScope } from "@/api/v1/services/authorization/resolve-view-scope";
import { VegetalModel } from "../../models/vegetal-model";
import { vegetalResponse } from "./create-vegetal";

const vegetalModel = new VegetalModel();

export async function getAllVegetaisRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/vegetal",
    {
      schema: {
        tags: ["Vegetal"],
        summary: "Get all Vegetais (estoque, escopo por view)",
        querystring: z.object({
          generalView: z.string(),
          regionView: z.string(),
          nucleoView: z.string(),
        }),
        response: { 200: z.array(vegetalResponse) },
      },
    },
    async (req, reply) => {
      const { generalView, regionView, nucleoView } = req.query;

      const { ownNucleoId } = await resolveViewScope({
        userId: req.user.userId,
        generalView,
        regionView,
        nucleoView,
      });

      if (generalView) {
        return reply.status(200).send(await vegetalModel.findAllGlobal());
      }
      if (regionView) {
        return reply.status(200).send(await vegetalModel.findAllByRegiao(regionView));
      }
      if (nucleoView) {
        return reply.status(200).send(await vegetalModel.findAllByNucleo(nucleoView));
      }
      if (!ownNucleoId) {
        return reply.status(200).send([]);
      }
      return reply.status(200).send(await vegetalModel.findAllByNucleo(ownNucleoId));
    }
  );
}
