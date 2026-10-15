import { authStatus } from '@/api/v1/controllers/google-oauth/auth-status'
import { googleCallback } from '@/api/v1/controllers/google-oauth/callback'
import { cleanupExpiredTokens } from '@/api/v1/controllers/google-oauth/cleanup-expired-tokens'
import { logout } from '@/api/v1/controllers/google-oauth/logout'
import { googleAuth } from '@/api/v1/controllers/google-oauth/oauth'
import { refreshToken } from '@/api/v1/controllers/google-oauth/refresh-token'
import { startAutoRefreshService } from '@/api/v1/services/google-oauth/google-oauth-refresh.service'
import { requireAcessoLiberado } from '@/middlewares/acesso-liberado-middleware'
import { authenticationMiddleware } from '@/middlewares/authentication-middleware'
import type { FastifyInstance } from 'fastify'

export async function oauthroute(app: FastifyInstance) {
  // FORA do gate de propósito — nenhuma das duas é chamada pelo app com o token
  // do usuário:
  // - /auth/google/callback é chamado pelo Google, que não manda JWT nenhum; a
  //   identidade vem do `state` assinado em /auth/google (que é gateado).
  // - /auth/cleanup nunca teve authenticationMiddleware e não é chamada por
  //   ninguém neste repositório (o refresh automático roda em processo, via
  //   startAutoRefreshService). Gateá-la fecharia um possível cron externo.
  app.register(googleCallback)
  app.register(cleanupExpiredTokens)

  // Integração com o Google Sheets: só faz sentido para quem tem acesso ao app.
  // O logout daqui é o da integração Google, não o da sessão do usuário
  // (/authentication/sign/out), então a tela de acesso pendente não depende dele.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware)
    scoped.register(requireAcessoLiberado)

    scoped.register(authStatus)
    scoped.register(logout)
    scoped.register(googleAuth)
    scoped.register(refreshToken)
  })

  startAutoRefreshService()
}
