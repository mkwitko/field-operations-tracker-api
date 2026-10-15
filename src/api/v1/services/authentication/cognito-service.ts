import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from "amazon-cognito-identity-js";
import { decode } from "jsonwebtoken";
import { BadRequestError } from "@/errors/bad-request-error";
import { EmailNaoConfirmadoError } from "@/errors/email-nao-confirmado-error";
import { env } from "@/env";

interface CognitoSignInParams {
  email: string;
  password: string;
}

export interface CognitoClaims {
  email: string;
  nome: string;
  /** custom:cargos — todos os cargos (texto ou código), separados por vírgula. */
  cargos: string | null;
  /** custom:cargo_nome — cargo principal (nome). */
  cargoNome: string | null;
  /** custom:cargo_codigo — cargo principal (código). */
  cargoCodigo: string | null;
  /** custom:grau — grau do usuário (ex.: QM, CI). */
  grau: string | null;
  /** custom:nucleo_nome — núcleo do usuário. */
  nucleoNome: string | null;
  /** custom:regiao_nome — região do usuário. */
  regiaoNome: string | null;
}

export const userPool = new CognitoUserPool({
  UserPoolId: env.COGNITO_USER_POOL_ID,
  ClientId: env.COGNITO_USER_POOL_CLIENT_ID,
});

/**
 * Autentica no Cognito (fonte de verdade das credenciais) via SRP
 * (USER_SRP_AUTH) e devolve os claims relevantes do IdToken.
 *
 * SRP é o fluxo padrão usado pelos frontends Amplify — funciona com client
 * público (sem secret) e sem exigir ALLOW_USER_PASSWORD_AUTH no app client.
 *
 * O IdToken é apenas decodificado (não verificado por JWKS): ele veio direto
 * da AWS via TLS nesta mesma requisição, então a origem já é confiável.
 */
export async function cognitoSignIn({
  email,
  password,
}: CognitoSignInParams): Promise<CognitoClaims> {
  const idToken = await new Promise<string>((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve(session.getIdToken().getJwtToken());
      },
      onFailure: (err) => {
        reject(err);
      },
      // Usuário precisa trocar a senha no primeiro acesso — tratamos como
      // credencial inválida por ora (fluxo de troca não é suportado aqui).
      newPasswordRequired: () => {
        reject(new BadRequestError("Credenciais inválidas"));
      },
    });
  }).catch((err: unknown) => {
    if (err instanceof BadRequestError) throw err;
    const code = (err as { code?: string; name?: string })?.code;

    // Cadastro existe mas falta confirmar o email — o app abre a tela de código.
    if (code === "UserNotConfirmedException") {
      throw new EmailNaoConfirmadoError();
    }

    // NotAuthorizedException / UserNotFoundException → mesma mensagem, para não
    // revelar quais emails existem no pool.
    if (
      code === "NotAuthorizedException" ||
      code === "UserNotFoundException"
    ) {
      throw new BadRequestError("Credenciais inválidas");
    }
    throw err;
  });

  const claims = decode(idToken);

  // DEBUG (só em dev): payload decodificado do IdToken — todos os claims
  // disponíveis. Nunca logar o JWT cru: é credencial bearer e vazaria sessão.
  if (env.ENVIRONMENT === "development") {
    console.log("[Cognito] IdToken claims:", JSON.stringify(claims, null, 2));
  }

  if (!claims || typeof claims === "string") {
    throw new BadRequestError("Credenciais inválidas");
  }

  const nome =
    (claims.name as string | undefined) ??
    (claims.given_name as string | undefined) ??
    (claims["cognito:username"] as string | undefined) ??
    email;

  return {
    email: (claims.email as string | undefined) ?? email,
    nome,
    cargos: (claims["custom:cargos"] as string | undefined) ?? null,
    cargoNome: (claims["custom:cargo_nome"] as string | undefined) ?? null,
    cargoCodigo: (claims["custom:cargo_codigo"] as string | undefined) ?? null,
    grau: (claims["custom:grau"] as string | undefined) ?? null,
    nucleoNome: (claims["custom:nucleo_nome"] as string | undefined) ?? null,
    regiaoNome: (claims["custom:regiao_nome"] as string | undefined) ?? null,
  };
}
