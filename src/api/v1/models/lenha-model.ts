import { PrismaClient } from "@prisma/client";
import type z from "zod";
import type { LenhaCreateInputSchema } from "../controllers/lenha/create-lenha";
import type { LenhaUpdateInputSchema } from "../controllers/lenha/update-lenha";

const prisma = new PrismaClient();

export class LenhaModel {
  async create(data: z.infer<typeof LenhaCreateInputSchema>) {
    return prisma.lenha.create({ data });
  }

  async update(data: z.infer<typeof LenhaUpdateInputSchema>) {
    return prisma.lenha.update({
      where: { id: data.id as string },
      data,
    });
  }

  async findById(id: string) {
    return prisma.lenha.findUnique({ where: { id } });
  }

  async findAll() {
    return prisma.lenha.findMany();
  }

  async exclude(id: string, soft = true) {
    if (soft) {
      return prisma.lenha.update({
        where: { id },
        data: { deletado: true, deletadoEm: new Date() },
      });
    }
    return prisma.lenha.delete({ where: { id } });
  }
}
