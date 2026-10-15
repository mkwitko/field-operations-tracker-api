import { PrismaClient } from "@prisma/client";
import type z from "zod";
import type { PreparosCreateInputSchema } from "../controllers/preparos/create-preparo";
import type { PreparosUpdateInputSchema } from "../controllers/preparos/update-preparo";

const prisma = new PrismaClient();

export class PreparosModel {
  async create(data: z.infer<typeof PreparosCreateInputSchema>) {
    const { mariri, chacrona, lenha, nucleosId, ...preparoData } = data;

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

    return prisma.preparos.create({
      data: {
        ...preparoData,
        ...(mariri && {
          mariri: {
            create: mariri,
          },
        }),
        ...(chacrona && {
          chacrona: {
            create: chacrona,
          },
        }),
        ...(lenha && {
          lenha: {
            create: lenha,
          },
        }),
        ...(nucleosId && {
          Nucleos: {
            connect: { id: nucleosId },
          },
        }),
      },
      include,
    });
  }

  async update(data: z.infer<typeof PreparosUpdateInputSchema>) {
    return prisma.preparos.update({
      where: { id: data.id as string },
      select: {
        id: true,
      },
      data: {
        mariri: {
          update: data.mariri,
        },
        chacrona: {
          update: data.chacrona,
        },
        lenha: {
          update: data.lenha,
        },
        producaoLitros: data.producaoLitros,
        inicio: data.inicio,
        fim: data.fim,
      },
    });
  }

  async findById(id: string) {
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
    return prisma.preparos.findUnique({ where: { id }, include });
  }

  async findAll(
    query: {
      dataInicio?: string;
      dataFim?: string;
    },
    nucleoId: string
  ) {
    const { dataInicio, dataFim } = query;

    const where: Record<string, any> = {};

    if (dataInicio && dataFim) {
      where.inicio = {
        gte: new Date(dataInicio),
        lte: new Date(dataFim),
      };
    }

    return prisma.preparos.findMany({
      where: {
        ...where,
        nucleosId: nucleoId,
      },
      include: {
        mariri: true,
        chacrona: true,
        lenha: true,
      },
      orderBy: { inicio: "desc" },
    });
  }

  async exclude(id: string, soft = false) {
    if (soft) {
      return prisma.preparos.update({
        where: { id },
        select: {
          id: true,
        },
        data: { deletado: true, deletadoEm: new Date() },
      });
    }
    return prisma.preparos.delete({
      where: { id },
      select: {
        id: true,
      },
    });
  }
}
