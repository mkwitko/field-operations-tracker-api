import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { confirmSignUp } from "../../services/authentication/cognito-confirm-service";

export async function confirmSignUpRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/confirm",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Confirmar email do cadastro",
        operationId: "confirmSignUp",
        description: "Confirma o cadastro com o código enviado por email.",
        body: z.object({
          email: z.string().email(),
          codigo: z.string().min(1),
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
      const { email, codigo } = request.body;

      await confirmSignUp({
        email: email.toLowerCase().trim(),
        codigo: codigo.trim(),
      });

      return reply.status(200).send({ ok: true });
    },
  );
}
