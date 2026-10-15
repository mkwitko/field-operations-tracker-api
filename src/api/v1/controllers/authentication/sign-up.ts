import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { signUpService } from "../../services/authentication/sign-up-service";

export async function signUpUser(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/sign/up",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Criar conta",
        operationId: "signUp",
        description:
          "Cria a conta localmente (senha no nosso banco) e guarda o núcleo escolhido. Não define cargo: cargo e grau continuam vindo do Cognito no login.",
        body: z
          .object({
            nome: z.string().min(3, "Informe seu nome completo"),
            email: z.string().email(),
            senha: z.string().min(8, "Mínimo 8 caracteres"),
            confirmarSenha: z.string(),
            nucleoId: z.string().cuid(),
          })
          .refine((data) => data.senha === data.confirmarSenha, {
            message: "As senhas não conferem",
            path: ["confirmarSenha"],
          }),
        response: {
          201: z.object({
            userConfirmed: z.boolean(),
          }),
          // `errors` só existe quando o 400 vem de falha de validação do zod
          // (body inválido); um BadRequestError de negócio (ex.: núcleo inválido)
          // manda só `message`. Por isso o campo é opcional aqui.
          400: z.object({
            message: z.string(),
            errors: z.record(z.array(z.string())).optional(),
          }),
          409: z.object({ message: z.string() }),
          429: z.object({ message: z.string() }),
        },
      },
      // Rate limit por rota: sem ele, abuso enche a tabela de usuários.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const { nome, email, senha, nucleoId } = request.body;

      const { userConfirmed } = await signUpService({
        nome: nome.trim(),
        email: email.toLowerCase().trim(),
        senha,
        nucleoId,
      });

      return reply.status(201).send({ userConfirmed });
    },
  );
}
