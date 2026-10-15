import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { MaririModel } from "../../models/mariri-model";
import { z } from "zod";
import { maririResponse } from "./create-mariri";

const maririModel = new MaririModel();

export async function getAllMaririsRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/mariri", {
    schema: {
      tags: ["Mariri"],
      summary: "Get all Mariris",
      response: { 200: z.array(maririResponse) },
    },
  }, async (_, reply) => {
    const mariris = await maririModel.findAll();
    return reply.status(200).send(mariris);
  });
}
