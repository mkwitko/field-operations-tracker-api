import type { FastifyJWT } from "@fastify/jwt";

interface UserWithCargos {
  id: string;
  email: string | null;
  nome: string;
  cargos: string | null;
  cargoNome: string | null;
  cargoCodigo: string | null;
}

/**
 * Monta o payload do nosso access token a partir do usuário local.
 * Os cargos vêm do Cognito e são persistidos no usuário a cada login, então o
 * nosso token carrega as mesmas infos de cargo do token do Cognito.
 */
export function buildTokenPayload(user: UserWithCargos): FastifyJWT["payload"] {
  return {
    userId: user.id,
    email: user.email,
    nome: user.nome,
    cargos: user.cargos
      ? user.cargos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    cargoNome: user.cargoNome,
    cargoCodigo: user.cargoCodigo,
  };
}
