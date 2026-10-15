import { prisma } from "prisma/db";

export class NucleosModel {
  // Atualiza as funcionalidades opcionais do núcleo.
  async updateConfig(
    id: string,
    config: {
      estoqueAtivo?: boolean;
    }
  ) {
    return prisma.nucleos.update({
      where: { id },
      data: config,
      select: {
        id: true,
        estoqueAtivo: true,
      },
    });
  }

  // Busca núcleo por ID
  async findById(id: string) {
    const center = await prisma.nucleos.findUniqueOrThrow({
      where: { id },
      include: {
        regioes: true,
      },
    });

    return center;
  }

  // Busca todos os núcleos não deletados
  async findAll() {
    const centers = await prisma.nucleos.findMany({
      where: { deletado: false },
      include: {
        regioes: true,
      },
      orderBy: {
        nome: "asc",
      },
    });

    return centers;
  }

  /** Listagem pré-login: só o necessário para o picker de núcleo do signup. */
  async findAllPublic() {
    const nucleos = await prisma.nucleos.findMany({
      where: { deletado: false },
      select: { id: true, nome: true, regioes: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    });

    return nucleos.map((n) => ({
      id: n.id,
      nome: n.nome,
      regiaoNome: n.regioes?.nome ?? null,
    }));
  }
}
