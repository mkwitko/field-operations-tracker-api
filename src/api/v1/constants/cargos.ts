import { PERMISSIONS, type PermissionName } from "@/permissions";

/**
 * ==========================================================================
 *  CONFIG DE CARGOS / ESCOPO / PERMISSÕES  — fonte única, fácil de manter.
 *  Para trocar/adicionar um cargo: edite a lista CARGOS abaixo (1 linha).
 *  Para mudar o que cada escopo concede: edite ESCOPO_PERMISSOES.
 * ==========================================================================
 */

// GLOBAL = todas as regiões · REGIONAL = só a própria região · LOCAL = só o próprio núcleo
export type Escopo = "GLOBAL" | "REGIONAL" | "LOCAL";

/** Permissões concedidas por escopo. Ninguém recebe ADMINISTRADOR. */
export const ESCOPO_PERMISSOES: Record<Escopo, PermissionName[]> = {
  GLOBAL: [PERMISSIONS.VER_REGIOES, PERMISSIONS.EXPORTAR_REGIOES],
  REGIONAL: [
    PERMISSIONS.VER_PROPRIA_REGIAO,
    PERMISSIONS.EXPORTAR_PROPRIA_REGIAO,
  ],
  LOCAL: [],
};

/** Ranking de escopo — maior vence quando há vários cargos/graus. */
export const ESCOPO_RANK: Record<Escopo, number> = {
  GLOBAL: 3,
  REGIONAL: 2,
  LOCAL: 1,
};

/** Grau que libera o acesso base ao app. */
export const GRAU_ACESSO = "QM";

/** Escopo do QM "puro" (grau QM, sem cargo) → própria região. Só Monitor (56) é LOCAL. */
export const ESCOPO_QM_PURO: Escopo = "REGIONAL";

interface CargoConfig {
  codigo: number;
  nome: string;
  escopo: Escopo;
}

/** ⇩⇩⇩  EDITE AQUI para trocar/adicionar cargos  ⇩⇩⇩ */
export const CARGOS: CargoConfig[] = [
  // GLOBAL — veem todas as regiões e exportam
  { codigo: 1, nome: "Mestre Geral Representante", escopo: "GLOBAL" },
  { codigo: 2, nome: "MESTRE ASSISTENTE GERAL", escopo: "GLOBAL" },
  { codigo: 3, nome: "PRESIDENTE DG", escopo: "GLOBAL" },
  { codigo: 4, nome: "VICE-PRESIDENTE DG", escopo: "GLOBAL" },
  { codigo: 21, nome: "DIRETOR(A) DO PLANTIO DG", escopo: "GLOBAL" },
  { codigo: 22, nome: "DIRETOR(A) ADJUNTO(A) PLANTIO DG", escopo: "GLOBAL" },
  { codigo: 23, nome: "Vice-Diretor(a) do Plantio DG", escopo: "GLOBAL" },
  // REGIONAL — veem só a própria região
  { codigo: 35, nome: "MESTRE CENTRAL", escopo: "REGIONAL" },
  { codigo: 36, nome: "MESTRE ASSISTENTE CENTRAL", escopo: "REGIONAL" },
  { codigo: 37, nome: "Coordenador Regional da DG", escopo: "REGIONAL" },
  { codigo: 40, nome: "COORDENADOR(A) REGIONAL DO PLANTIO", escopo: "REGIONAL" },
  { codigo: 26, nome: "1º SECRETÁRIO(A) PLANTIO DG", escopo: "GLOBAL" },
  { codigo: 27, nome: "2º SECRETÁRIO(A) PLANTIO DG", escopo: "GLOBAL" },
  { codigo: 47, nome: "MESTRE REPRESENTANTE", escopo: "REGIONAL" },
  { codigo: 48, nome: "RESPONSÁVEL PELA DAV", escopo: "REGIONAL" }, // igual ao 47
  { codigo: 49, nome: "PRESIDENTE LOCAL", escopo: "REGIONAL" },
  // LOCAL — vê só o próprio núcleo
  { codigo: 56, nome: "MONITOR(A) DO PLANTIO LOCAL", escopo: "LOCAL" },
];

/** Normaliza texto p/ comparação: minúsculo, sem acento, sem espaços extras. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const CARGO_BY_NOME = new Map(CARGOS.map((c) => [normalize(c.nome), c]));
const CARGO_BY_CODIGO = new Map(CARGOS.map((c) => [c.codigo, c]));

/**
 * Casa os cargos do token contra a config. Funciona se `custom:cargos` vier em
 * TEXTO (nomes) ou em CÓDIGO (números), separados por vírgula. `cargoCodigo`
 * (custom:cargo_codigo) entra como fallback do cargo mais alto.
 */
export function matchCargos(
  cargosClaim: string | null | undefined,
  cargoCodigo?: string | number | null,
): CargoConfig[] {
  const matched = new Map<number, CargoConfig>();

  const tokens = (cargosClaim ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const asNumber = Number(token);
    const byCodigo = Number.isFinite(asNumber)
      ? CARGO_BY_CODIGO.get(asNumber)
      : undefined;
    const byNome = CARGO_BY_NOME.get(normalize(token));
    const hit = byCodigo ?? byNome;
    if (hit) matched.set(hit.codigo, hit);
  }

  if (cargoCodigo != null) {
    const hit = CARGO_BY_CODIGO.get(Number(cargoCodigo));
    if (hit) matched.set(hit.codigo, hit);
  }

  return [...matched.values()];
}
