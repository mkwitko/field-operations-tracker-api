import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { resendConfirmationCode } from "../../services/authentication/cognito-confirm-service";

export async function resendConfirmationRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/confirm/resend",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Reenviar código de confirmação",
        operationId: "resendConfirmation",
        description: "Reenvia por email o código de confirmação do cadastro.",
        body: z.object({
          email: z.string().email(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ message: z.string() }),
          429: z.object({ message: z.string() }),
        },
      },
      // Rate limit por rota: abuso aqui cria usuário no pool do Cognito.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      await resendConfirmationCode({
        email: request.body.email.toLowerCase().trim(),
      });

      return reply.status(200).send({ ok: true });
    },
  );
}
