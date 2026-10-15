import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { findUsersService } from "../../services/user/find-users-service";

export async function findUsers(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/user/find/all",
      {
        schema: {
          tags: ["User"],
          summary: "Find All Users",
          description: "Find all Users",
          operationId: "findAllUsers",
          response: {
            201: z.array(
              z.object({
                id: z.string(),
                nome: z.string(),
                email: z.string().nullable(),
                nucleo: z
                  .object({
                    id: z.string(),
                    nome: z.string(),
                  })
                  .nullable(),
              }),
            ),
          },
        },
      },
      async (_, response) => {
        const { users } = await findUsersService();
        return response.status(201).send(users);
      },
    );
}
