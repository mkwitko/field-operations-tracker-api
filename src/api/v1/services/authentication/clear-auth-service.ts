import { env } from '@/env'
import type { FastifyReply } from 'fastify'

export function clearAuth(reply: FastifyReply) {
  reply.clearCookie('accessToken', {
    httpOnly: true, // Optional, depending on your implementation
    secure: env.ENVIRONMENT === 'production', // Set to true if using HTTPS
    sameSite: env.ENVIRONMENT === 'production' ? 'none' : 'lax', // Set to 'strict' or 'none' based on your needs
  })

  reply.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.ENVIRONMENT === 'production',
    sameSite: env.ENVIRONMENT === 'production' ? 'none' : 'lax',
  })
}
