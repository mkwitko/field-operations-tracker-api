import { env } from "@/env";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

export async function signOut(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/sign/out",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Sign out",
        description: "Sign out",
        operationId: "signOut",
        response: {
          201: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      reply.clearCookie("accessToken", {
        httpOnly: true, // Optional, depending on your implementation
        secure: env.ENVIRONMENT === "production", // Set to true if using HTTPS
        sameSite: env.ENVIRONMENT === "production" ? "none" : "lax", // Set to 'strict' or 'none' based on your needs
      });

      reply.clearCookie("refreshToken", {
        httpOnly: true,
        secure: env.ENVIRONMENT === "production",
        sameSite: env.ENVIRONMENT === "production" ? "none" : "lax",
      });

      return reply.status(200).send({ message: "Successfully signed out." });
    }
  );
}
