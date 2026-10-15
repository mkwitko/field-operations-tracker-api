import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { MaririModel } from "../../models/mariri-model";
import { z } from "zod";
import { maririResponse } from "./create-mariri";

const maririModel = new MaririModel();

export async function deleteMaririRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().delete("/mariri/:id", {
    schema: {
      tags: ["Mariri"],
      summary: "Delete Mariri",
      params: z.object({ id: z.string() }),
      querystring: z.object({ soft: z.boolean().optional() }),
      response: { 200: maririResponse },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { soft = true } = request.query;
    const mariri = await maririModel.exclude(id, soft);
    return reply.status(200).send(mariri);
  });
}
