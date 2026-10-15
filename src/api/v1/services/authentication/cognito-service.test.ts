import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateUser = vi.fn();

vi.mock("amazon-cognito-identity-js", () => ({
  CognitoUserPool: vi.fn(() => ({})),
  CognitoUser: vi.fn(() => ({ authenticateUser })),
  AuthenticationDetails: vi.fn(() => ({})),
}));

vi.mock("@/env", () => ({
  env: {
    COGNITO_USER_POOL_ID: "pool",
    COGNITO_USER_POOL_CLIENT_ID: "client",
    ENVIRONMENT: "production",
  },
}));

import { EmailNaoConfirmadoError } from "@/errors/email-nao-confirmado-error";
import { BadRequestError } from "@/errors/bad-request-error";
import { cognitoSignIn } from "./cognito-service";

describe("cognitoSignIn", () => {
  beforeEach(() => {
    authenticateUser.mockReset();
  });

  it("devolve EmailNaoConfirmadoError quando o usuário não confirmou o email", async () => {
    authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onFailure({ code: "UserNotConfirmedException" });
    });

    await expect(
      cognitoSignIn({ email: "a@b.com", password: "12345678" }),
    ).rejects.toBeInstanceOf(EmailNaoConfirmadoError);
  });

  it("devolve BadRequestError quando a senha está errada", async () => {
    authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onFailure({ code: "NotAuthorizedException" });
    });

    await expect(
      cognitoSignIn({ email: "a@b.com", password: "12345678" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
