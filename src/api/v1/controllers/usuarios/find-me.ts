import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { findUserByIdService } from "../../services/user/find-user-by-id-service";
import { clearAuth } from "../../services/authentication/clear-auth-service";
import { userResponse } from "./user-response";

export async function findMe(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/user/find/me",
      {
        schema: {
          tags: ["User"],
          summary: "Find Me",
          description: "Find Me",
          operationId: "findMe",
          response: {
            201: userResponse,
            409: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, response) => {
        const id = request.user.userId;
        const { user } = await findUserByIdService({ id });

        if (response.statusCode === 409) {
          clearAuth(response);
        }

        return response
          .status(201)
          .send(user)
          .status(409)
          .send({ message: "Desconectando usuário" });
      }
    );
}
