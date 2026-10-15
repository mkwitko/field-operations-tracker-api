import { env } from "@/env"
import { google } from "googleapis"
import { prisma } from "prisma/db"

const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutos antes de expirar

/**
 * Verifica e atualiza tokens que estão próximos de expirar
 * Pode ser chamado periodicamente (ex: a cada 1 minuto)
 */
export async function refreshExpiringTokens() {
  try {
    const now = new Date()
    const refreshThreshold = new Date(now.getTime() + REFRESH_BUFFER_MS)

    // Buscar todos os tokens que expiram nos próximos 5 minutos
    const expiringTokens = await prisma.googleTokens.findMany({
      where: {
        expiryDate: {
          lte: refreshThreshold,
        },
      },
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

    console.log(`[Token Refresh Service] Found ${expiringTokens.length} tokens to refresh`)

    const results = await Promise.allSettled(
      expiringTokens.map(async (tokenData) => {
        // Pular usuários inativos ou deletados
        if (tokenData.usuario && (tokenData.usuario.deletado || !tokenData.usuario.ativo)) {
          return { success: false, userId: tokenData.usuarioId, reason: "User inactive" }
        }

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

          console.log(`[Token Refresh Service] Successfully refreshed token for user: ${tokenData.usuarioId}`)
          return { success: true, userId: tokenData.usuarioId }
        } catch (error) {
          console.error(`[Token Refresh Service] Failed to refresh token for user: ${tokenData.usuarioId}`, error)

          // Só deletar se já expirou completamente
          if (now >= tokenData.expiryDate) {
            await prisma.googleTokens.delete({
              where: { id: tokenData.id },
            })
            console.log(`[Token Refresh Service] Deleted expired token for user: ${tokenData.usuarioId}`)
          }

          return { success: false, userId: tokenData.usuarioId, error }
        }
      }),
    )

    const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length
    const failed = results.length - successful

    console.log(`[Token Refresh Service] Refresh complete: ${successful} successful, ${failed} failed`)

    return { successful, failed, total: results.length }
  } catch (error) {
    console.error("[Token Refresh Service] Error in refresh service:", error)
    throw error
  }
}

/**
 * Inicia um intervalo para refresh automático
 * @param intervalMs Intervalo em milissegundos (padrão: 5 minuto)
 */
export function startAutoRefreshService(intervalMs = 60 * 1000 * 5) {
  console.log(`[Token Refresh Service] Starting auto-refresh service (interval: ${intervalMs}ms)`)

  // Executar imediatamente
  refreshExpiringTokens().catch(console.error)

  // Depois executar no intervalo
  const interval = setInterval(() => {
    refreshExpiringTokens().catch(console.error)
  }, intervalMs)

  return () => {
    console.log("[Token Refresh Service] Stopping auto-refresh service")
    clearInterval(interval)
  }
}
