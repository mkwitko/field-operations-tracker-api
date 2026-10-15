import { deriveAccess } from "./derive-access";

interface AcessoLiberadoParams {
  grau: string | null;
  cargos: string | null;
  cargoCodigo: string | null;
  bypass: boolean;
}

/**
 * Recalcula se o usuário tem acesso ao app a partir do cargo/grau já persistidos.
 *
 * Não dá para usar a lista de permissões como gate: ESCOPO_PERMISSOES.LOCAL é
 * vazio, então o cargo 56 (Monitor do Plantio Local) tem acesso e nenhuma
 * permissão. Aqui a pergunta é só "pode entrar?".
 */
export function acessoLiberado({
  grau,
  cargos,
  cargoCodigo,
  bypass,
}: AcessoLiberadoParams): boolean {
  return deriveAccess({
    grau,
    cargosClaim: cargos,
    cargoCodigo,
    bypass,
  }).podeAcessar;
}
