import { resolveViewScope } from "@/api/v1/services/authorization/resolve-view-scope";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "prisma/db";
import z from "zod";
import { preparosResponse } from "./create-preparo";

export async function getAllPreparosRoute(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/preparo",
      {
        schema: {
          tags: ["Preparos"],
          summary:
            "Get all Preparos (optional filters: general, region, nucleo)",
          operationId: "getAllPreparos",
          querystring: z.object({
            generalView: z.string(),
            regionView: z.string(),
            nucleoView: z.string(),
          }),
          response: {
            200: z.array(preparosResponse),
          },
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
          mariri: true,
          chacrona: true,
          lenha: true,
          Nucleos: {
            select: {
              nome: true,
              regioes: {
                select: { nome: true },
              },
            },
          },
        };

        // General view → all preparos
        if (generalView) {
          const preparos = await prisma.preparos.findMany({
            include,
            orderBy: { inicio: "desc" },
          });
          return reply.status(200).send(preparos);
        }

        // Region view → preparos by region
        if (regionView) {
          const preparos = await prisma.preparos.findMany({
            where: {
              Nucleos: {
                regioesId: regionView,
              },
            },
            include,
            orderBy: { inicio: "desc" },
          });
          return reply.status(200).send(preparos);
        }

        // Nucleo view → preparos by specific nucleo
        if (nucleoView) {
          const preparos = await prisma.preparos.findMany({
            where: {
              nucleosId: nucleoView,
            },
            include,
            orderBy: { inicio: "desc" },
          });
          return reply.status(200).send(preparos);
        }

        // Default → current user’s nucleo
        if (!ownNucleoId) {
          return reply.status(200).send([]);
        }

        const preparos = await prisma.preparos.findMany({
          where: { nucleosId: ownNucleoId },
          include,
          orderBy: { inicio: "desc" },
        });

        return reply.status(200).send(preparos);
      }
    );
}
