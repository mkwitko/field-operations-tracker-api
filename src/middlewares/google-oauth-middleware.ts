// ============= FILE: middlewares/google-oauth-middleware.ts =============
import { env } from "@/env"
import type { FastifyReply, FastifyRequest } from "fastify"
import { google } from "googleapis"
import { prisma } from "prisma/db"

const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutos

/**
 * Middleware to authenticate Google OAuth requests
 * Should be used as a preHandler
 */
export async function googleSheetsAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.userId

  if (!userId) {
    return reply.status(401).send({
      error: "Não autorizado",
      message: "Usuário não autenticado",
    })
  }

  try {
    // Get token from database by userId
    const tokenData = await prisma.googleTokens.findUnique({
      where: { usuarioId: userId },
      include: {
        usuario: {
          select: {
            id: true,
            ativo: true,
            deletado: true,
          },
        },
      },
    })

    if (!tokenData) {
      return reply.status(401).send({
        error: "Não autorizado",
        message: "Token Google não encontrado. Conecte sua conta Google novamente.",
      })
    }

    // Check if user exists and is active
    if (tokenData.usuario) {
      if (tokenData.usuario.deletado || !tokenData.usuario.ativo) {
        return reply.status(401).send({
          error: "Não autorizado",
          message: "Usuário inativo ou deletado",
        })
      }
    }

    const now = new Date()
    const timeUntilExpiry = tokenData.expiryDate.getTime() - now.getTime()
    const shouldRefresh = timeUntilExpiry <= REFRESH_BUFFER_MS

    if (shouldRefresh) {
      request.log.info(`Token expiring soon or expired for user: ${userId}, attempting refresh`)

      try {
        const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.REDIRECT_URI)

        oauth2Client.setCredentials({
          refresh_token: tokenData.refreshToken,
        })

        const { credentials } = await oauth2Client.refreshAccessToken()

        const newExpiryDate = new Date(credentials.expiry_date || Date.now() + 3600 * 1000)

        await prisma.googleTokens.update({
          where: { id: tokenData.id },
          data: {
            accessToken: credentials.access_token!,
            refreshToken: credentials.refresh_token || tokenData.refreshToken,
            expiryDate: newExpiryDate,
          },
        })

        request.log.info(`Token refreshed successfully for user: ${userId}`)

        request.googleToken = credentials.access_token as string
        return
      } catch (refreshError) {
        request.log.error("Token refresh failed:", refreshError)

        if (now >= tokenData.expiryDate) {
          // Só deletar se realmente expirou
          await prisma.googleTokens.delete({
            where: { id: tokenData.id },
          })

          return reply.status(401).send({
            error: "Não autorizado",
            message: "Token expirado e falha ao renovar. Faça login novamente",
          })
        } 
          // Token ainda válido, usar o atual mesmo com falha no refresh
          request.log.warn(`Refresh failed but token still valid for user: ${userId}`)
          request.googleToken = tokenData.accessToken
          return
      }
    }

    // Token still valid
    request.googleToken = tokenData.accessToken
  } catch (error) {
    request.log.error("Auth middleware error:", error)
    return reply.status(500).send({
      error: "Erro interno",
      message: "Falha ao verificar autenticação com o Google",
    })
  }
}
