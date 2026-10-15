import { authenticationStatus } from '@/api/v1/controllers/authentication/auth-status'
import { authenticateUser } from '@/api/v1/controllers/authentication/authenticate'
import { confirmSignUpRoute } from '@/api/v1/controllers/authentication/confirm-sign-up'
import { refreshToken } from '@/api/v1/controllers/authentication/refresh-token'
import { resendConfirmationRoute } from '@/api/v1/controllers/authentication/resend-confirmation'
import { signOut } from '@/api/v1/controllers/authentication/sign-out'
import { signUpUser } from '@/api/v1/controllers/authentication/sign-up'
import type { FastifyInstance } from 'fastify'

export async function authenticationRoute(app: FastifyInstance) {
  app.register(authenticationStatus)
  app.register(authenticateUser)
  app.register(refreshToken)
  app.register(signOut)
  app.register(signUpUser)
  app.register(confirmSignUpRoute)
  app.register(resendConfirmationRoute)
}
