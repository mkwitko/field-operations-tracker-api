import { UnauthorizedError } from "@/errors/unauthorized-error";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { refreshTokenService } from "../../services/authentication/refresh-token-service";
import { authenticationMiddleware } from "@/middlewares/authentication-middleware";

export async function refreshToken(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authenticationMiddleware)
    .post(
      "/authentication/refresh",
      {
        schema: {
          tags: ["Authentication"],
          operationId: "refreshToken",
          summary: "Refresh collaborator tokens",
          body: z.object({
            refreshToken: z.string(),
          }),
          response: {
            201: z.object({
              accessToken: z.string(),
              refreshToken: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const { refreshToken } = request.body;
        try {
          const response = await refreshTokenService(refreshToken);

          return reply.status(201).send({
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
          });
        } catch (error) {
          throw new UnauthorizedError("Token inválido");
        }
      }
    );
}
