import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { MaririModel } from "../../models/mariri-model";
import { z } from "zod";
import { maririResponse } from "./create-mariri";

const maririModel = new MaririModel();

export async function getMaririByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/mariri/:id", {
    schema: {
      tags: ["Mariri"],
      summary: "Get Mariri by ID",
      params: z.object({ id: z.string() }),
      response: {
        200: maririResponse,
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const mariri = await maririModel.findById(request.params.id);
    if (!mariri) return reply.status(404).send({ message: "Mariri not found" });
    return reply.status(200).send(mariri);
  });
}
