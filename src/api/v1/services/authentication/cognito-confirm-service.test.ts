import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmRegistration = vi.fn();
const resendConfirmationCodeMock = vi.fn();

vi.mock("amazon-cognito-identity-js", () => ({
  CognitoUserPool: vi.fn(() => ({})),
  CognitoUser: vi.fn(() => ({
    confirmRegistration,
    resendConfirmationCode: resendConfirmationCodeMock,
  })),
  AuthenticationDetails: vi.fn(() => ({})),
  CognitoUserAttribute: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    COGNITO_USER_POOL_ID: "pool",
    COGNITO_USER_POOL_CLIENT_ID: "client",
    ENVIRONMENT: "production",
  },
}));

import { BadRequestError } from "@/errors/bad-request-error";
import {
  confirmSignUp,
  resendConfirmationCode,
} from "./cognito-confirm-service";

describe("confirmSignUp", () => {
  beforeEach(() => {
    confirmRegistration.mockReset();
    resendConfirmationCodeMock.mockReset();
  });

  it("resolve quando o código está correto", async () => {
    confirmRegistration.mockImplementation((_code, _force, cb) =>
      cb(null, "SUCCESS"),
    );

    await expect(
      confirmSignUp({ email: "a@b.com", codigo: "123456" }),
    ).resolves.toBeUndefined();
  });

  it("devolve mensagem única para código errado e expirado", async () => {
    confirmRegistration.mockImplementation((_code, _force, cb) =>
      cb({ code: "CodeMismatchException" }, undefined),
    );

    await expect(
      confirmSignUp({ email: "a@b.com", codigo: "000000" }),
    ).rejects.toThrow("Código inválido ou expirado");

    confirmRegistration.mockImplementation((_code, _force, cb) =>
      cb({ code: "ExpiredCodeException" }, undefined),
    );

    await expect(
      confirmSignUp({ email: "a@b.com", codigo: "000000" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("reenvia o código", async () => {
    resendConfirmationCodeMock.mockImplementation((cb) => cb(null, {}));

    await expect(
      resendConfirmationCode({ email: "a@b.com" }),
    ).resolves.toBeUndefined();
  });
});
