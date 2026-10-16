import { fastifyCors } from "@fastify/cors";
import { fastifyJwt } from "@fastify/jwt";
import fastifyRateLimit from "@fastify/rate-limit";

import { fastify } from "fastify";
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

import { env } from "./env";
import { errorHandler } from "./error-handler";
import { TooManyRequestsError } from "./errors/too-many-requests-error";

import fastifyCookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyWebsocket from "@fastify/websocket";
import qs from "qs";
import Routing from "./routes";

// O `export` fica aqui, na declaração, e não num `export { app }` no fim do
// arquivo: `routes/index.ts` importa este módulo de volta (ciclo), e com o
// export no fim o binding ainda está indefinido quando `Routing()` roda.
export const app = fastify({
  querystringParser: (str) => qs.parse(str), // Use qs for parsing query strings
  // 1 = confia só no último hop (o proxy TLS do host). Sem isso, `req.ip` é o
  // IP do proxy e o rate limit vira um balde único para todo mundo; com `true`,
  // o cliente falsificaria X-Forwarded-For e furaria o limite pelo outro lado.
  trustProxy: 1,
}).withTypeProvider<ZodTypeProvider>();

// Jwt Authentication
app.register(fastifyJwt, {
  sign: {
    algorithm: "RS256",
    expiresIn: "1h",
  },
  secret: {
    private: Buffer.from(env.JWT_PRIVATE_KEY, "base64"),
    public: Buffer.from(env.JWT_PUBLIC_KEY, "base64"),
  },
});

app.setErrorHandler(errorHandler);

// Zod Type Provider
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifyCookie);

// Rate limit global desligado; aplicado por rota (ver rotas públicas de
// autenticação). Abuso nas rotas públicas cria usuário no pool do Cognito.
// `errorResponseBuilder` troca o Error cru do plugin (que só carrega
// `.statusCode`, sem ser instância de nada) por `TooManyRequestsError`, que o
// error-handler.ts já reconhece via `instanceof` — sem isso, o erro do
// plugin cai no 500 genérico do error-handler.
app.register(fastifyRateLimit, {
  global: false,
  errorResponseBuilder: () => new TooManyRequestsError(),
});

// Cors Policy
app.register(fastifyCors, {
  origin:
    env.ENVIRONMENT === "production"
      ? ["https://tracker.example.com", "http://localhost:8091"]
      : "http://localhost:8091", // Change this to your front-end origin
  credentials: true, // This allows cookies to be sent
});

// Swagger Documentation
app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Field Operations Tracker API",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  transform: jsonSchemaTransform,
});
app.register(fastifyWebsocket);

// HTTP Routes
Routing();

// Swagger Documentation UI
app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});
