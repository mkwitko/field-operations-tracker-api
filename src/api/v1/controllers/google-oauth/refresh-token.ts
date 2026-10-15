import { env } from "@/env"
import type { FastifyInstance } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { google } from "googleapis"
import { prisma } from "prisma/db"
import z from "zod"

export const RefreshTokenResponseSchema = z.object({
  message: z.string(),
  expiryDate: z.string(),
  expiresIn: z.number(), // segundos até expirar
  shouldRefreshAgainAt: z.string(), // quando fazer o próximo refresh
})

export async function refreshToken(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .post(
      "/auth/refresh",
      {
        schema: {
          tags: ["Auth"],
          summary: "Refresh Access Token",
          description: "Atualiza o token de acesso usando o refresh token",
          operationId: "refreshAccessToken",
          response: {
            200: RefreshTokenResponseSchema,
            401: z.object({
              error: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const userId = request.user.userId

        try {
          const tokenData = await prisma.googleTokens.findUnique({
            where: { usuarioId: userId },
          })

          if (!tokenData) {
            return reply.status(401).send({
              error: "Sessão não encontrada ou expirada",
            })
          }

          const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.REDIRECT_URI)

          oauth2Client.setCredentials({
            refresh_token: tokenData.refreshToken,
          })

          const { credentials } = await oauth2Client.refreshAccessToken()

          const newExpiryDate = new Date(credentials.expiry_date || Date.now() + 3600 * 1000)

          // Update tokens in database
          await prisma.googleTokens.update({
            where: { usuarioId: userId },
            data: {
              accessToken: credentials.access_token!,
              refreshToken: credentials.refresh_token || tokenData.refreshToken,
              expiryDate: newExpiryDate,
            },
          })

          const expiresInMs = newExpiryDate.getTime() - Date.now()
          const expiresInSeconds = Math.floor(expiresInMs / 1000)
          const refreshAgainAt = new Date(newExpiryDate.getTime() - 5 * 60 * 1000)

          return reply.status(200).send({
            message: "Token atualizado com sucesso",
            expiryDate: newExpiryDate.toISOString(),
            expiresIn: expiresInSeconds,
            shouldRefreshAgainAt: refreshAgainAt.toISOString(),
          })
        } catch (error) {
          request.log.error(error)

          request.log.error("Failed to refresh token, but keeping session for retry")

          return reply.status(401).send({
            error: "Falha ao atualizar token. Tente novamente.",
          })
        }
      },
    )
}
