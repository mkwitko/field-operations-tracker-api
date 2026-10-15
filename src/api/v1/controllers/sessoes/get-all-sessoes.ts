import { resolveViewScope } from "@/api/v1/services/authorization/resolve-view-scope";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import z from "zod";
import { sessoesResponse } from "./create-sessao";

export async function getAllSessoesRoute(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/sessao",
      {
        schema: {
          tags: ["Sessoes"],
          summary: "Get all Sessoes (optional date filter)",
          querystring: z.object({
            generalView: z.string(),
            regionView: z.string(),
            nucleoView: z.string(),
          }),
          response: { 200: z.array(sessoesResponse) },
        },
      },
      async (req, reply) => {
        const { generalView, regionView, nucleoView } = req.query;

        // Valida o escopo pedido contra permissões + própria região/núcleo.
        const { ownNucleoId } = await resolveViewScope({
          userId: req.user.userId,
          generalView,
          regionView,
          nucleoView,
        });

        const include = {
          Nucleos: {
            select: {
              nome: true,
              regioes: {
                select: {
                  nome: true,
                },
              },
            },
          },
          vegetais: {
            include: {
              vegetal: { select: { id: true, nome: true, tipo: true } },
            },
          },
        };

        if (generalView) {
          const sessoes = await prisma.sessoes.findMany({
            include,
            orderBy: {
              data: "desc",
            },
          });
          return reply.status(200).send(sessoes);
        }

        if (regionView) {
          const sessoes = await prisma.sessoes.findMany({
            where: {
              Nucleos: {
                regioesId: regionView,
              },
            },
            include,
            orderBy: {
              data: "desc",
            },
          });
          return reply.status(200).send(sessoes);
        }

        if (nucleoView) {
          const sessoes = await prisma.sessoes.findMany({
            where: {
              nucleosId: nucleoView,
            },
            include,
            orderBy: {
              data: "desc",
            },
          });
          return reply.status(200).send(sessoes);
        }

        if (!ownNucleoId) {
          return reply.status(200).send([]);
        }

        const sessoes = await prisma.sessoes.findMany({
          where: { nucleosId: ownNucleoId },
          include,
          orderBy: {
            data: "desc",
          },
        });

        return reply.status(200).send(sessoes);
      }
    );
}
