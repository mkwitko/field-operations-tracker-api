import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number(),
  ENVIRONMENT: z.enum(["development", "production"]).default("production"),
  DATABASE_URL: z.string(),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  REDIRECT_URI: z.string().url(),
  EXPO_SCHEME: z.string(),
  COGNITO_REGION: z.string(),
  COGNITO_USER_POOL_ID: z.string(),
  COGNITO_USER_POOL_CLIENT_ID: z.string(),  
  // Emails (separados por vírgula) que recebem bypass de dev — acesso garantido.
  BYPASS_EMAILS: z.string().default(""),
  // Mock de claims (SÓ dev, SÓ para emails em BYPASS_EMAILS). Testar cargo/grau.
  MOCK_ENABLED: z.string().default("false"),
  MOCK_BYPASS: z.string().default("true"), // "false" p/ testar o gate sem bypass
  MOCK_GRAU: z.string().optional(),
  MOCK_CARGOS: z.string().optional(),
  MOCK_CARGO_CODIGO: z.string().optional(),
  MOCK_CARGO_NOME: z.string().optional(),
  MOCK_NUCLEO_NOME: z.string().optional(),
  MOCK_REGIAO_NOME: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (_env.success === false) {
  console.log(
    `Invalid environment variables: ${JSON.stringify(
      _env.error.flatten().fieldErrors
    )}`
  );
  throw new Error(
    `Invalid environment variables: ${_env.error.flatten().fieldErrors}`
  );
}

export const env = _env.data;
