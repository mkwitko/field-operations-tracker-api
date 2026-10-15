import { describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("prisma/db", () => ({
  prisma: { nucleos: { findMany: (args: unknown) => findMany(args) } },
}));

import { NucleosModel } from "./nucleos-model";

describe("NucleosModel.findAllPublic", () => {
  it("achata a região e esconde os campos de config", async () => {
    findMany.mockResolvedValue([
      { id: "n1", nome: "Núcleo A", regioes: { nome: "Região 1" } },
      { id: "n2", nome: "Núcleo B", regioes: null },
    ]);

    const result = await new NucleosModel().findAllPublic();

    expect(result).toEqual([
      { id: "n1", nome: "Núcleo A", regiaoNome: "Região 1" },
      { id: "n2", nome: "Núcleo B", regiaoNome: null },
    ]);
  });

  it("filtra deletados e ordena por nome", async () => {
    findMany.mockResolvedValue([]);

    await new NucleosModel().findAllPublic();

    expect(findMany).toHaveBeenCalledWith({
      where: { deletado: false },
      select: { id: true, nome: true, regioes: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    });
  });
});
