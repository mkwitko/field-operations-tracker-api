import { CognitoUser } from "amazon-cognito-identity-js";
import { BadRequestError } from "@/errors/bad-request-error";
import { TooManyRequestsError } from "@/errors/too-many-requests-error";
import { userPool } from "./cognito-service";

/** Traduz erro do Cognito nas rotas de confirmação. */
function mapConfirmError(err: { code?: string; message?: string }): Error {
  if (
    err.code === "CodeMismatchException" ||
    err.code === "ExpiredCodeException"
  ) {
    // Mensagem única: distinguir "errado" de "expirado" não ajuda quem digitou.
    return new BadRequestError("Código inválido ou expirado");
  }

  if (
    err.code === "LimitExceededException" ||
    err.code === "TooManyRequestsException"
  ) {
    return new TooManyRequestsError();
  }

  return new BadRequestError(err.message ?? "Não foi possível confirmar");
}

export async function confirmSignUp({
  email,
  codigo,
}: {
  email: string;
  codigo: string;
}): Promise<void> {
  const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });

  return new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(codigo, true, (err) => {
      if (err) return reject(mapConfirmError(err));
      resolve();
    });
  });
}

export async function resendConfirmationCode({
  email,
}: {
  email: string;
}): Promise<void> {
  const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });

  return new Promise((resolve, reject) => {
    cognitoUser.resendConfirmationCode((err) => {
      if (err) return reject(mapConfirmError(err));
      resolve();
    });
  });
}
