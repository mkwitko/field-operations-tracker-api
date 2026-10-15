import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { findUserByIdService } from "../../services/user/find-user-by-id-service";
import { userResponse } from "./user-response";

export async function findUserById(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/user/find/id",
      {
        schema: {
          tags: ["User"],
          summary: "Find User by ID",
          description: "Find a user by ID",
          operationId: "findUserById",
          querystring: z.object({
            id: z.string().cuid(),
          }),
          response: {
            // Gate de acesso é sobre o usuário logado (/me), não sobre
            // listagem administrativa de terceiros.
            201: userResponse.omit({ acessoLiberado: true }),
          },
        },
      },
      async (request, response) => {
        const { user } = await findUserByIdService(request.query);
        return response.status(201).send(user);
      }
    );
}
