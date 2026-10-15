import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { VegetalModel } from "../../models/vegetal-model";
import { vegetalResponse } from "./create-vegetal";

const vegetalModel = new VegetalModel();

export async function getVegetalByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/vegetal/:id",
    {
      schema: {
        tags: ["Vegetal"],
        summary: "Get Vegetal by ID",
        params: z.object({ id: z.string() }),
        response: {
          200: vegetalResponse,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const vegetal = await vegetalModel.findById(request.params.id);
      if (!vegetal) return reply.status(404).send({ message: "Vegetal not found" });
      return reply.status(200).send(vegetal);
    }
  );
}
