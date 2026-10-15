import { env } from "@/env";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import z from "zod";

export async function googleAuth(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/auth/google",
      {
        schema: {
          tags: ["Auth"],
          summary: "Initiate Google OAuth",
          description: "Inicia o fluxo de autenticação OAuth do Google",
          operationId: "initiateGoogleAuth",
          response: {
            200: z.object({
              authUrl: z.string(),
            }),
            500: z.object({
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        try {
          const userId = request.user.userId;
          const stateData = { usuarioId: userId };
          const state = Buffer.from(JSON.stringify(stateData)).toString(
            "base64"
          );

          const oauth2Client = new google.auth.OAuth2(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET,
            env.REDIRECT_URI
          );

          console.log({ oauth2Client });

          const authUrl = oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: [
              "https://www.googleapis.com/auth/spreadsheets",
              "https://www.googleapis.com/auth/drive.file",
            ],
            state,
            prompt: "consent", // Garante que sempre recebemos refresh_token
          });

          console.log("Generated auth URL:", authUrl);

          return reply.status(200).send({ authUrl });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({
            error: "Falha ao iniciar autenticação",
            message:
              error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
    );
}
