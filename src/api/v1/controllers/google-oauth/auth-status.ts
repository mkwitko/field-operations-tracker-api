import type { FastifyInstance } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { prisma } from "prisma/db"
import z from "zod"

export const AuthStatusResponseSchema = z.object({
  authenticated: z.boolean(),
  email: z.string().optional(),
  usuario: z
    .object({
      id: z.string(),
      nome: z.string(),
    })
    .optional(),
  tokenExpiresAt: z.string().optional(),
  tokenExpiresIn: z.number().optional(), // segundos
  needsRefresh: z.boolean().optional(), // se está perto de expirar
})

export async function authStatus(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/auth/status",
      {
        schema: {
          tags: ["Auth"],
          summary: "Check Authentication Status",
          description: "Verifica se o usuário está autenticado",
          operationId: "checkAuthStatus",
          response: {
            200: AuthStatusResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const userId = request.user.userId

        try {
          const tokenData = await prisma.googleTokens.findUnique({
            where: { usuarioId: userId },
            include: {
              usuario: {
                select: {
                  id: true,
                  nome: true,
                  email: true,
                },
              },
            },
          })

          if (!tokenData) {
            return reply.status(200).send({ authenticated: false })
          }

          const now = new Date()
          const expiresInMs = tokenData.expiryDate.getTime() - now.getTime()
          const expiresInSeconds = Math.floor(expiresInMs / 1000)
          const needsRefresh = expiresInMs <= 5 * 60 * 1000 // menos de 5 minutos

          if (expiresInSeconds <= 0) {
            return reply.status(200).send({
              authenticated: false,
              needsRefresh: true,
            })
          }

          return reply.status(200).send({
            authenticated: true,
            usuario: tokenData.usuario || undefined,
            tokenExpiresAt: tokenData.expiryDate.toISOString(),
            tokenExpiresIn: expiresInSeconds,
            needsRefresh,
          })
        } catch (error) {
          request.log.error(error)
          return reply.status(200).send({ authenticated: false })
        }
      },
    )
}
