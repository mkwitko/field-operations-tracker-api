import "@fastify/jwt";

declare module "@fastify/jwt" {
  export interface FastifyJWT {
    payload: {
      userId: string;
      // Claims espelhados do Cognito (opcionais p/ compat com tokens antigos).
      email?: string | null;
      nome?: string;
      cargos?: string[];
      cargoNome?: string | null;
      cargoCodigo?: string | null;
    };
  }
}

import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    googleToken?: string;
  }
}

