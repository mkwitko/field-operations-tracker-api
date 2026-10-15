import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { LenhaModel } from "../../models/lenha-model";
import { z } from "zod";
import { lenhaResponse } from "./create-lenha";

const lenhaModel = new LenhaModel();

export async function getAllLenhasRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/lenha", {
    schema: {
      tags: ["Lenha"],
      summary: "Get all Lenhas",
      response: { 200: z.array(lenhaResponse) },
    },
  }, async (_, reply) => {
    const lenhas = await lenhaModel.findAll();
    return reply.status(200).send(lenhas);
  });
}
