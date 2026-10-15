import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { NucleosModel } from "../../models/nucleos-model";
import { nucleosResponse } from "./nucleo-response";

const nucleosModel = new NucleosModel();

export async function getNucleoByIdRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/nucleo/find",
    {
      schema: {
        tags: ["Nucleos"],
        summary: "Get Nucleo by ID",
        description: "Retrieve a Nucleo by its ID",
        operationId: "getNucleoById",
        querystring: z.object({
          id: z.string(),
        }),
        response: {
          200: nucleosResponse,
        },
      },
    },
    async (request, response) => {
      const nucleos = await nucleosModel.findById(request.query.id);
      return response.status(200).send(nucleos);
    },
  );
}
