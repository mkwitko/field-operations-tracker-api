/**
 * Litros são guardados como String (convenção do projeto). Valores vêm do app
 * em pt-BR ("1.234,56") ou já canônicos ("12.5"). Normaliza para number.
 */
export function parseLitros(value: string | null | undefined): number {
  if (!value) return 0;
  const raw = String(value).trim();
  // Se tem vírgula, ela é o decimal e os pontos são milhar.
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const n = Number.parseFloat(normalized);
  return Number.isNaN(n) ? 0 : n;
}

/** Formato canônico de armazenamento: número com ponto decimal, 2 casas. */
export function formatLitros(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export type LocalVegetal = "estoque" | "geladeira";

export function campoSaldo(local: LocalVegetal): "litrosEstoque" | "litrosGeladeira" {
  return local === "geladeira" ? "litrosGeladeira" : "litrosEstoque";
}
