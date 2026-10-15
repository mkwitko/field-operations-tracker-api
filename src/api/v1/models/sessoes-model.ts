import { prisma } from "prisma/db";
import type z from "zod";
import { BadRequestError } from "@/errors/bad-request-error";
import type { SessoesCreateInputSchema } from "../controllers/sessoes/create-sessao";
import type { SessoesUpdateInputSchema } from "../controllers/sessoes/update-sessao";
import {
  campoSaldo,
  formatLitros,
  type LocalVegetal,
  parseLitros,
} from "../services/vegetal/litros";

const include = {
  Nucleos: {
    select: {
      nome: true,
      regioes: { select: { nome: true } },
    },
  },
  vegetais: {
    include: {
      vegetal: { select: { id: true, nome: true, tipo: true } },
    },
  },
};

type Consumo = {
  vegetalId: string;
  quantidade: string;
  local: string;
  filtrado?: string;
};

// Linha de consumo persistida (com os campos de controle de saldo).
type ConsumoRow = {
  vegetalId: string;
  quantidade: string;
  local: string;
  filtrado: string;
  descontouEstoque: boolean;
  saldoGeladeira: boolean;
};

// Prisma transaction client (query estendido). Tipagem frouxa por simplicidade.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Soma dos litros consumidos — usado para popular quantidadeVegetal. */
function totalConsumo(vegetais: Consumo[]): string {
  return formatLitros(vegetais.reduce((s, v) => s + parseLitros(v.quantidade), 0));
}

/** Soma delta (litros, pode ser negativo) a um campo de saldo do vegetal. */
async function somarCampo(
  tx: Tx,
  vegetalId: string,
  campo: "litrosEstoque" | "litrosGeladeira",
  delta: number
) {
  if (delta === 0) return;
  const veg = await tx.vegetal.findUnique({ where: { id: vegetalId } });
  if (!veg) throw new BadRequestError("Vegetal não encontrado");

  const novo = parseLitros(veg[campo]) + delta;
  if (novo < 0) {
    const onde = campo === "litrosGeladeira" ? "geladeira" : "estoque";
    throw new BadRequestError(
      `Saldo insuficiente de "${veg.nome}" no ${onde}: ${formatLitros(
        parseLitros(veg[campo])
      )}L disponível`
    );
  }
  await tx.vegetal.update({
    where: { id: veg.id },
    data: { [campo]: formatLitros(novo) },
  });
}

/**
 * Aplica (sinal -1) ou reverte (sinal +1) o efeito de uma linha de consumo nos saldos.
 * - Desconta `filtrado` do `local` (quando descontouEstoque).
 * - Soma a diferença (filtrado - consumido) na geladeira (quando saldoGeladeira).
 */
async function ajustarSaldo(tx: Tx, row: ConsumoRow, sinal: 1 | -1) {
  const filtrado = parseLitros(row.filtrado);
  const consumido = parseLitros(row.quantidade);
  const diff = filtrado - consumido;

  if (row.descontouEstoque && filtrado > 0) {
    const campo = campoSaldo(row.local as LocalVegetal);
    await somarCampo(tx, row.vegetalId, campo, sinal * -1 * filtrado);
  }
  if (row.saldoGeladeira && diff > 0) {
    await somarCampo(tx, row.vegetalId, "litrosGeladeira", sinal * diff);
  }
}

/** Normaliza um consumo de entrada em linha persistível, aplicando as flags da sessão. */
function toRow(
  c: Consumo,
  descontarEstoque: boolean,
  adicionarGeladeira: boolean
): ConsumoRow {
  // Sem filtrado explícito, usa o consumido (comportamento legado).
  const filtrado = c.filtrado != null && c.filtrado !== "" ? c.filtrado : c.quantidade;
  return {
    vegetalId: c.vegetalId,
    quantidade: c.quantidade,
    local: c.local,
    filtrado: formatLitros(parseLitros(filtrado)),
    descontouEstoque: descontarEstoque,
    saldoGeladeira: descontarEstoque && adicionarGeladeira,
  };
}

export class SessoesModel {
  async create(data: z.infer<typeof SessoesCreateInputSchema> & { nucleosId?: string }) {
    const vegetais = (data.vegetais ?? []) as Consumo[];
    const descontar = data.descontarEstoque ?? true;
    const geladeira = data.adicionarGeladeira ?? false;
    const rows = vegetais.map((v) => toRow(v, descontar, geladeira));

    const quantidadeVegetal = vegetais.length
      ? totalConsumo(vegetais)
      : (data.quantidadeVegetal ?? "0");

    return prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await ajustarSaldo(tx, r, -1);
      }
      return tx.sessoes.create({
        data: {
          sessao: data.sessao,
          pessoas: data.pessoas,
          data: data.data,
          descricao: data.descricao,
          quantidadeVegetal,
          nucleosId: data.nucleosId,
          vegetais: rows.length
            ? {
                create: rows.map((r) => ({
                  quantidade: r.quantidade,
                  local: r.local,
                  vegetalId: r.vegetalId,
                  filtrado: r.filtrado,
                  descontouEstoque: r.descontouEstoque,
                  saldoGeladeira: r.saldoGeladeira,
                })),
              }
            : undefined,
        },
        include,
      });
    });
  }

  async update(data: z.infer<typeof SessoesUpdateInputSchema> & { nucleosId?: string }) {
    const vegetais = data.vegetais as Consumo[] | undefined;
    const descontar = data.descontarEstoque ?? true;
    const geladeira = data.adicionarGeladeira ?? false;

    return prisma.$transaction(async (tx) => {
      // Só mexe em saldo se o array de vegetais foi enviado (substitui tudo).
      if (vegetais) {
        const antigos = await tx.sessaoVegetal.findMany({
          where: { sessaoId: data.id },
        });
        // Devolve saldo dos consumos antigos (usa as flags persistidas).
        for (const a of antigos) {
          await ajustarSaldo(tx, a as ConsumoRow, +1);
        }
        await tx.sessaoVegetal.deleteMany({ where: { sessaoId: data.id } });
        // Desconta os novos.
        const rows = vegetais.map((v) => toRow(v, descontar, geladeira));
        for (const r of rows) {
          await ajustarSaldo(tx, r, -1);
        }
        await tx.sessaoVegetal.createMany({
          data: rows.map((r) => ({
            sessaoId: data.id,
            quantidade: r.quantidade,
            local: r.local,
            vegetalId: r.vegetalId,
            filtrado: r.filtrado,
            descontouEstoque: r.descontouEstoque,
            saldoGeladeira: r.saldoGeladeira,
          })),
        });
      }

      const { id, vegetais: _omit, ...rest } = data;
      const quantidadeVegetal = vegetais?.length
        ? totalConsumo(vegetais)
        : rest.quantidadeVegetal;

      return tx.sessoes.update({
        where: { id },
        select: { id: true },
        data: { ...rest, quantidadeVegetal },
      });
    });
  }

  async findById(id: string) {
    return prisma.sessoes.findUnique({ where: { id }, include });
  }

  async findAll(
    query: { dataInicio?: string; dataFim?: string },
    nucleoId: string
  ) {
    const { dataInicio, dataFim } = query;
    const where: Record<string, any> = {};

    if (dataInicio && dataFim) {
      where.data = { gte: dataInicio, lte: dataFim };
    } else if (dataInicio) {
      where.data = { gte: dataInicio };
    } else if (dataFim) {
      where.data = { lte: dataFim };
    }

    return prisma.sessoes.findMany({
      where: { ...where, nucleosId: nucleoId },
      include,
      orderBy: { data: "desc" },
    });
  }

  /** Exclui a sessão devolvendo os litros consumidos aos saldos dos vegetais. */
  async exclude(id: string) {
    return prisma.$transaction(async (tx) => {
      const consumos = await tx.sessaoVegetal.findMany({
        where: { sessaoId: id },
      });
      for (const c of consumos) {
        await ajustarSaldo(tx, c as ConsumoRow, +1);
      }
      // Cascade em SessaoVegetal cuida das linhas de consumo.
      return tx.sessoes.delete({ where: { id }, select: { id: true } });
    });
  }
}
