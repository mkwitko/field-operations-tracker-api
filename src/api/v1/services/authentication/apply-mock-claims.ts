import { env } from "@/env";
import type { CognitoClaims } from "./cognito-service";

const mockOn = env.MOCK_ENABLED === "true" && env.ENVIRONMENT === "development";

/**
 * Mock de claims para testes — SÓ em desenvolvimento e SÓ para emails listados
 * em BYPASS_EMAILS. Permite simular cargo/grau/núcleo/região sem depender do
 * que o Cognito manda. Campos não definidos no .env mantêm o valor real.
 */
export function isMockClaimsEmail(
  email: string,
  bypassEmails: string[],
): boolean {
  return mockOn && bypassEmails.includes(email.toLowerCase());
}

export function applyMockClaims(claims: CognitoClaims): CognitoClaims {
  return {
    ...claims,
    grau: env.MOCK_GRAU ?? claims.grau,
    cargos: env.MOCK_CARGOS ?? claims.cargos,
    cargoCodigo: env.MOCK_CARGO_CODIGO ?? claims.cargoCodigo,
    cargoNome: env.MOCK_CARGO_NOME ?? claims.cargoNome,
    nucleoNome: env.MOCK_NUCLEO_NOME ?? claims.nucleoNome,
    regiaoNome: env.MOCK_REGIAO_NOME ?? claims.regiaoNome,
  };
}

/** Quando o mock está ativo, o bypass segue MOCK_BYPASS (default true). */
export function mockBypass(): boolean {
  return env.MOCK_BYPASS !== "false";
}
