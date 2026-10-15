import { prisma } from "prisma/db";
import type z from "zod";
import type { VegetalCreateInputSchema } from "../controllers/vegetal/create-vegetal";
import type { VegetalUpdateInputSchema } from "../controllers/vegetal/update-vegetal";

const include = {
  Nucleos: {
    select: {
      nome: true,
      regioes: { select: { nome: true } },
    },
  },
};

export class VegetalModel {
  async create(data: z.infer<typeof VegetalCreateInputSchema> & { nucleosId: string }) {
    return prisma.vegetal.create({
      data: {
        nome: data.nome,
        tipo: data.tipo,
        dataPreparo: data.dataPreparo,
        mestrePreparo: data.mestrePreparo,
        observacoes: data.observacoes,
        litrosEstoque: data.litrosEstoque ?? "0",
        litrosGeladeira: data.litrosGeladeira ?? "0",
        nucleosId: data.nucleosId,
      },
    });
  }

  async update(data: z.infer<typeof VegetalUpdateInputSchema>) {
    const { id, ...rest } = data;
    return prisma.vegetal.update({
      where: { id },
      data: rest,
    });
  }

  async findById(id: string) {
    return prisma.vegetal.findUnique({ where: { id } });
  }

  /** Lista vegetais de um núcleo (não deletados). Base do seletor de sessão. */
  async findAllByNucleo(nucleoId: string) {
    return prisma.vegetal.findMany({
      where: { nucleosId: nucleoId, deletado: false },
      include,
      orderBy: { criadoEm: "desc" },
    });
  }

  async findAllByRegiao(regiaoId: string) {
    return prisma.vegetal.findMany({
      where: { deletado: false, Nucleos: { regioesId: regiaoId } },
      include,
      orderBy: { criadoEm: "desc" },
    });
  }

  async findAllGlobal() {
    return prisma.vegetal.findMany({
      where: { deletado: false },
      include,
      orderBy: { criadoEm: "desc" },
    });
  }

  async exclude(id: string, soft = true) {
    if (soft) {
      return prisma.vegetal.update({
        where: { id },
        data: { deletado: true, deletadoEm: new Date() },
      });
    }
    return prisma.vegetal.delete({ where: { id } });
  }
}
