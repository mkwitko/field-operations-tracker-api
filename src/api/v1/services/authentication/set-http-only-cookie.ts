import { env } from '@/env'
import type { FastifyReply } from 'fastify'

export function setHttpOnlyCookie(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
) {
  // Set HttpOnly cookies for access and refresh tokens
  reply.setCookie('accessToken', accessToken, {
    httpOnly: true, // Prevents JavaScript access
    secure: env.ENVIRONMENT === 'production', // Only send over HTTPS in production
    sameSite: env.ENVIRONMENT === 'production' ? 'none' : 'lax', // Helps protect against CSRF
    maxAge: 3600 * 24, // 1 hour expiration for access token
    path: '/',
  })

  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true, // Prevents JavaScript access
    secure: env.ENVIRONMENT === 'production', // Only send over HTTPS in production
    sameSite: env.ENVIRONMENT === 'production' ? 'none' : 'lax', // Helps protect against CSRF
    maxAge: 2592000, // 30 days expiration for refresh token
    path: '/',
  })
}
