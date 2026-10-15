import {
  ESCOPO_PERMISSOES,
  ESCOPO_QM_PURO,
  ESCOPO_RANK,
  GRAU_ACESSO,
  matchCargos,
  type Escopo,
} from "@/api/v1/constants/cargos";
import type { PermissionName } from "@/permissions";

interface DeriveAccessParams {
  grau: string | null | undefined;
  cargosClaim: string | null | undefined;
  cargoCodigo?: string | number | null;
  bypass: boolean;
}

export interface AccessResult {
  podeAcessar: boolean;
  permissoes: PermissionName[];
}

/**
 * Decide se o usuário pode acessar o app e quais permissões recebe, a partir
 * do grau, cargos (Cognito) e bypass. Regra e mapeamento vivem em
 * `constants/cargos.ts` — aqui só a combinação.
 */
export function deriveAccess({
  grau,
  cargosClaim,
  cargoCodigo,
  bypass,
}: DeriveAccessParams): AccessResult {
  const cargos = matchCargos(cargosClaim, cargoCodigo);
  const isQm = grau === GRAU_ACESSO;

  const podeAcessar = bypass || isQm || cargos.length > 0;
  if (!podeAcessar) {
    return { podeAcessar: false, permissoes: [] };
  }

  const escopos: Escopo[] = cargos.map((c) => c.escopo);
  if (isQm) escopos.push(ESCOPO_QM_PURO);
  if (bypass) escopos.push("GLOBAL");

  const maiorEscopo = escopos.reduce<Escopo>(
    (maior, atual) =>
      ESCOPO_RANK[atual] > ESCOPO_RANK[maior] ? atual : maior,
    "LOCAL",
  );

  return { podeAcessar: true, permissoes: ESCOPO_PERMISSOES[maiorEscopo] };
}
