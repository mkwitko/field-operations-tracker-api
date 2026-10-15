// import { isAxiosError } from 'axios'
import type { FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { BadRequestError } from "./errors/bad-request-error";
import { ConflictError } from "./errors/conflict-error";
import { EmailNaoConfirmadoError } from "./errors/email-nao-confirmado-error";
import { ForbiddenError } from "./errors/forbidden-error";
import { PrismaError } from "./errors/prisma-error";
import { TooManyRequestsError } from "./errors/too-many-requests-error";
import { UnauthorizedError } from "./errors/unauthorized-error";
import { clearAuth } from "./api/v1/services/authentication/clear-auth-service";

type FastifyErrorHandler = FastifyInstance["errorHandler"];

export const errorHandler: FastifyErrorHandler = (error, request, reply) => {
  console.log(error);
  if (error instanceof ZodError) {
    return reply.status(400).send({
      message: "Erro de validação",
      errors: error.flatten().fieldErrors,
    });
  }

  // Falha de validação de schema (body/params/querystring) via fastify-type-provider-zod.
  // A lib não lança o ZodError bruto aqui: o `validatorCompiler` devolve os erros num
  // formato próprio (ver hasZodFastifySchemaValidationErrors), que o Fastify embrulha
  // como um erro nativo FST_ERR_VALIDATION antes de chegar aqui. Sem este bloco, essas
  // falhas caíam no 500 genérico do fim do arquivo.
  if (hasZodFastifySchemaValidationErrors(error)) {
    const errors: Record<string, string[]> = {};

    for (const issue of error.validation) {
      const field = String(issue.params.issue.path[0] ?? "_root");
      errors[field] = [...(errors[field] ?? []), issue.message];
    }

    return reply.status(400).send({
      message: "Erro de validação",
      errors,
    });
  }

  // if (isAxiosError(error)) {
  //   return reply.status(error.response?.status || 500).send({
  //     message: error.message || 'External service error',
  //   })
  // }

  if (error instanceof BadRequestError) {
    return reply.status(400).send({
      message: error.message,
    });
  }

  if (error instanceof EmailNaoConfirmadoError) {
    return reply.status(403).send({
      message: error.message,
      code: "EMAIL_NAO_CONFIRMADO",
    });
  }

  if (error instanceof TooManyRequestsError) {
    return reply.status(429).send({
      message: error.message,
    });
  }

  if (error instanceof ForbiddenError) {
    return reply.status(403).send({
      message: error.message,
    });
  }

  if (error instanceof ConflictError) {
    return reply.status(409).send({
      message: error.message,
    });
  }

  if (error instanceof UnauthorizedError) {
    clearAuth(reply);
    return reply.status(401).send({
      message: error.message,
    });
  }

  if (error instanceof PrismaError) {
    if (
      error.message ===
        "Operação falhou porque registros dependentes não foram encontrados: Expected a record, found none." ||
      request.url === "/user/find/me"
    ) {
      clearAuth(reply);
    }
    return reply.status(409).send({
      message: error.message,
    });
  }

  // Send error to some observability service

  return reply.status(500).send({
    message: "Internal server error",
  });
};
