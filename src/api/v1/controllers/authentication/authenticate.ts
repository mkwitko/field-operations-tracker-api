import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { authenticationService } from "../../services/authentication/authentication-service";
import { buildTokenPayload } from "../../services/authentication/build-token-payload";
import { env } from "@/env";

export async function authenticateUser(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/sign/in",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Authenticate user",
        operationId: "signIn",
        description: "Authenticate user",
        body: z.object({
          email: z.string(),
          password: z.string().min(6),
        }),
        response: {
          201: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
          }),
          403: z.object({
            message: z.string(),
            code: z.literal("EMAIL_NAO_CONFIRMADO"),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const { user } = await authenticationService({ email, password });

      const accessToken = app.jwt.sign(buildTokenPayload(user), {
        expiresIn: "1d",
      });

      const refreshToken = app.jwt.sign(
        {
          userId: user.id,
        },
        { expiresIn: "30d" }
      );

      // Set HttpOnly cookies for access and refresh tokens
      reply.setCookie("accessToken", accessToken, {
        httpOnly: true, // Prevents JavaScript access
        secure: env.ENVIRONMENT === "production", // Only send over HTTPS in production
        sameSite: env.ENVIRONMENT === "production" ? "none" : "lax", // Helps protect against CSRF
        maxAge: 3600 * 24, // 1 hour expiration for access token
        path: "/",
      });

      reply.setCookie("refreshToken", refreshToken, {
        httpOnly: true, // Prevents JavaScript access
        secure: env.ENVIRONMENT === "production", // Only send over HTTPS in production
        sameSite: env.ENVIRONMENT === "production" ? "none" : "lax", // Helps protect against CSRF
        maxAge: 2592000, // 30 days expiration for refresh token
        path: "/",
      });

      return reply.status(201).send({
        accessToken,
        refreshToken,
      });
    }
  );
}
