import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

export async function authenticationStatus(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/authentication/status",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Check if user is authenticated",
        operationId: "authenticationStatus",
        description: "Check if user is authenticated",
        response: {
          201: z.object({
            logged: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      return reply.status(201).send({
        logged: request.cookies.accessToken
          ? !!app.jwt.verify(request.cookies.accessToken)
          : false,
      });
    }
  );
}
