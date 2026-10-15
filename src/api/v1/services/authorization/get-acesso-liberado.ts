import { prisma } from "prisma/db";
import { acessoLiberado } from "./acesso-liberado";

/**
 * Recalcula o acesso ao app a partir do que está persistido no usuário.
 *
 * Fica junto do `acesso-liberado.ts` de propósito: a regra de "pode entrar?" e
 * a consulta que a alimenta vivem no mesmo lugar. `select` enxuto — só os
 * quatro campos que `acessoLiberado` usa, sem carregar o usuário inteiro.
 *
 * Usuário inexistente (ou linha removida) devolve `false`.
 */
export async function getAcessoLiberado(userId: string): Promise<boolean> {
  const user = await prisma.usuarios.findUnique({
    where: { id: userId },
    select: {
      grau: true,
      cargos: true,
      cargoCodigo: true,
      bypass: true,
    },
  });

  if (!user) return false;

  return acessoLiberado({
    grau: user.grau,
    cargos: user.cargos,
    cargoCodigo: user.cargoCodigo,
    bypass: user.bypass,
  });
}
