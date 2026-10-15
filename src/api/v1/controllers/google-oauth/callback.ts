import { env } from "@/env";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import { prisma } from "prisma/db";
import z from "zod";

export const GoogleCallbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string(),
});

export async function googleCallback(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/auth/google/callback",
    {
      schema: {
        tags: ["Auth"],
        summary: "Google OAuth Callback",
        description: "Callback do OAuth do Google",
        operationId: "googleOAuthCallback",
        querystring: GoogleCallbackQuerySchema,
      },
    },
    async (request, reply) => {
      const { code, error, state } = request.query;

      console.log({ code, error, state });

      if (error) {
        request.log.error("OAuth error:", error);
        return reply.redirect(
          `${env.EXPO_SCHEME}://authenticated?error=${error}`
        );
      }

      if (!code) {
        return reply.redirect(
          `${env.EXPO_SCHEME}://authenticated?error=no_code`
        );
      }

      try {
        const oauth2Client = new google.auth.OAuth2(
          env.GOOGLE_CLIENT_ID,
          env.GOOGLE_CLIENT_SECRET,
          env.REDIRECT_URI
        );

        console.log("Exchanging code for tokens... - ", code);
        const { tokens } = await oauth2Client.getToken(code);
        console.log("Tokens received:", tokens);

        oauth2Client.setCredentials(tokens);

        const sessionId = crypto.randomUUID();
        const expiryDate = new Date(
          tokens.expiry_date || Date.now() + 3600 * 1000
        );

        let usuarioId = "";

        try {
          // Decodificar o state que contém o ID do usuário do app
          const stateData = JSON.parse(Buffer.from(state, "base64").toString());
          usuarioId = stateData.usuarioId || null;
        } catch (err) {
          request.log.warn("Failed to parse state:", err);
        }

        const existingToken = await prisma.googleTokens.findUnique({
          where: {
            usuarioId: usuarioId, // Busca pela combinação usuário app + email Google
          },
        });

        if (existingToken) {
          // Atualizar tokens existentes
          await prisma.googleTokens
            .update({
              where: { id: existingToken.id },
              data: {
                sessionId,
                accessToken: tokens.access_token!,
                refreshToken: tokens.refresh_token!,
                expiryDate,
              },
            })
            .catch((err) => {
              console.log("Error updating existing token:", err);
            });
        } else {
          // Criar nova conexão Google
          await prisma.googleTokens.create({
            data: {
              sessionId,
              accessToken: tokens.access_token!,
              refreshToken: tokens.refresh_token!,
              expiryDate,
              usuarioId, // Pode ser null se não estiver vinculado a um usuário
            },
          });
        }

        console.log(
          "Google OAuth successful, redirecting to:",
          `${env.EXPO_SCHEME}://authenticated?session=${sessionId}`
        );

        return reply.redirect(
          `${env.EXPO_SCHEME}://authenticated?session=${sessionId}`
        );
      } catch (error) {
        console.log("OAuth callback error:", error);
        request.log.error("OAuth callback error:", error);
        return reply.redirect(
          `${env.EXPO_SCHEME}://authenticated/(tabs)/integration?error=authentication_failed`
        );
      }
    }
  );
}
