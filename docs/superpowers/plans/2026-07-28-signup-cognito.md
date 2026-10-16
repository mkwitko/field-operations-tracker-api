# Signup no Cognito com acesso pendente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a pessoa crie a conta pelo app (conta criada no próprio Cognito, com escolha de núcleo) e que quem não tem cargo entre e veja uma tela de acesso pendente em vez de receber 403 no login.

**Architecture:** O back deixa de bloquear o login por falta de cargo e passa a expor `acessoLiberado` no `/me`, recalculado por `deriveAccess`. Três rotas públicas novas (`sign/up`, `confirm`, `confirm/resend`) falam com o Cognito via `amazon-cognito-identity-js` (APIs não autenticadas, sem IAM), e uma quarta (`GET /public/nucleo`) alimenta o picker de núcleo pré-login. O app ganha telas de signup, confirmação de código e acesso pendente.

**Tech Stack:** Back: Fastify 5, `fastify-type-provider-zod`, Prisma 6, `amazon-cognito-identity-js`, vitest. App: Expo Router, react-hook-form + zod, TanStack Query, orval (cliente HTTP gerado), NativeWind.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-28-signup-cognito-design.md`.
- **Nenhuma variável de ambiente nova.** Só `COGNITO_REGION`, `COGNITO_USER_POOL_ID` e `COGNITO_USER_POOL_CLIENT_ID`, que já existem em `src/env/index.ts`.
- **Nenhuma migration.** O schema Prisma não muda.
- **Nunca criar nem alterar cargo/grau no Cognito.** O `signUp` envia apenas os atributos `email` e `name`.
- Nenhuma API administrativa do Cognito (`AdminGetUser`, `AdminCreateUser`, `AdminConfirmSignUp`) — todas exigem credencial IAM.
- Mensagens ao usuário em português, exatamente como no spec:
  - conta já existe: `"Você já tem conta. Entre com a senha do Mural Digital."`
  - código inválido: `"Código inválido ou expirado"`
  - credencial inválida: `"Credenciais inválidas"`
  - excesso de tentativas: `"Muitas tentativas, tente mais tarde"`
- Rate limit das rotas públicas: 5 requisições por IP por hora.
- Senha mínima de 8 caracteres na validação do body; a política real de senha é a do pool e sua mensagem de erro é repassada crua.
- `src/http/generated/` no app é gerado por orval — nunca editar à mão.
- Testes do back: `npm test` (vitest, `vitest.config.mts` já configurado com `vite-tsconfig-paths`). Prisma e Cognito sempre mockados com `vi.mock` — os testes não tocam banco nem rede.
- Commits em português, prefixo `feat:`/`test:`/`refactor:`, um por task.

---

### Task 1: `acessoLiberado` no `/me` e login sem gate de cargo

Hoje `authentication-service.ts:52` lança `ForbiddenError` quando `deriveAccess` devolve `podeAcessar: false`, o que impede o login de quem não tem cargo. Esta task remove esse bloqueio e expõe a mesma informação ao app pelo `/me`.

Atenção ao motivo do desenho: o app **não** pode usar `permissoes.length === 0` como gate, porque `ESCOPO_PERMISSOES.LOCAL` é `[]` (`src/api/v1/constants/cargos.ts:22`) — o cargo 56 (Monitor do Plantio Local) tem acesso e nenhuma permissão.

**Files:**
- Create: `src/api/v1/services/authorization/acesso-liberado.ts`
- Create: `src/api/v1/services/authorization/acesso-liberado.test.ts`
- Modify: `src/api/v1/services/authentication/authentication-service.ts:51-54` (remover o throw)
- Modify: `src/api/v1/services/user/find-user-by-id-service.ts` (acrescentar `acessoLiberado` ao user devolvido)
- Modify: `src/api/v1/controllers/usuarios/user-response.ts` (novo campo no schema de resposta)

**Interfaces:**
- Consumes: `deriveAccess({ grau, cargosClaim, cargoCodigo, bypass })` de `@/api/v1/services/authorization/derive-access` (não muda neste plano).
- Produces:
  - `acessoLiberado(user: { grau: string | null; cargos: string | null; cargoCodigo: string | null; bypass: boolean }): boolean`
  - `/user/find/me` passa a devolver `acessoLiberado: boolean` no corpo — consumido pela Task 9.

- [ ] **Step 1: Write the failing test**

Criar `src/api/v1/services/authorization/acesso-liberado.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { acessoLiberado } from "./acesso-liberado";

const semAcesso = {
  grau: null,
  cargos: null,
  cargoCodigo: null,
  bypass: false,
};

describe("acessoLiberado", () => {
  it("nega quem não tem cargo nem grau", () => {
    expect(acessoLiberado(semAcesso)).toBe(false);
  });

  it("libera grau QM sem cargo", () => {
    expect(acessoLiberado({ ...semAcesso, grau: "QM" })).toBe(true);
  });

  it("libera cargo LOCAL, que não concede nenhuma permissão", () => {
    // Cargo 56 = MONITOR(A) DO PLANTIO LOCAL, escopo LOCAL, ESCOPO_PERMISSOES.LOCAL = []
    expect(acessoLiberado({ ...semAcesso, cargoCodigo: "56" })).toBe(true);
  });

  it("libera bypass mesmo sem cargo e sem grau", () => {
    expect(acessoLiberado({ ...semAcesso, bypass: true })).toBe(true);
  });

  it("aceita cargos vindos em texto separado por vírgula", () => {
    expect(
      acessoLiberado({ ...semAcesso, cargos: "PRESIDENTE LOCAL" }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- acesso-liberado`
Expected: FAIL — `Failed to resolve import "./acesso-liberado"`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/api/v1/services/authorization/acesso-liberado.ts`:

```ts
import { deriveAccess } from "./derive-access";

interface AcessoLiberadoParams {
  grau: string | null;
  cargos: string | null;
  cargoCodigo: string | null;
  bypass: boolean;
}

/**
 * Recalcula se o usuário tem acesso ao app a partir do cargo/grau já persistidos.
 *
 * Não dá para usar a lista de permissões como gate: ESCOPO_PERMISSOES.LOCAL é
 * vazio, então o cargo 56 (Monitor do Plantio Local) tem acesso e nenhuma
 * permissão. Aqui a pergunta é só "pode entrar?".
 */
export function acessoLiberado({
  grau,
  cargos,
  cargoCodigo,
  bypass,
}: AcessoLiberadoParams): boolean {
  return deriveAccess({
    grau,
    cargosClaim: cargos,
    cargoCodigo,
    bypass,
  }).podeAcessar;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- acesso-liberado`
Expected: PASS, 5 testes.

- [ ] **Step 5: Remover o gate do login**

Em `src/api/v1/services/authentication/authentication-service.ts`, apagar o bloco:

```ts
  // 3. Sem acesso → rejeita o login (não emite token).
  if (!access.podeAcessar) {
    throw new ForbiddenError("Sem acesso ao aplicativo");
  }
```

e trocar por:

```ts
  // 3. Falta de cargo não bloqueia o login: o app mostra a tela de acesso
  // pendente a partir de `acessoLiberado` no /me. As rotas protegidas seguem
  // barradas pelo permission-middleware.
```

Remover também o import agora sem uso na linha 9:

```ts
import { ForbiddenError } from "@/errors/forbidden-error";
```

- [ ] **Step 6: Expor `acessoLiberado` no `/me`**

Em `src/api/v1/services/user/find-user-by-id-service.ts`, substituir o arquivo inteiro por:

```ts
import { acessoLiberado } from "../authorization/acesso-liberado";
import { UsuariosModel } from "../../models/usuarios-model";

export async function findUserByIdService({ id }: { id: string }) {
  const userModel = new UsuariosModel();
  const user = await userModel.findById(id);

  return {
    user: {
      ...user,
      acessoLiberado: acessoLiberado({
        grau: user.grau,
        cargos: user.cargos,
        cargoCodigo: user.cargoCodigo,
        bypass: user.bypass,
      }),
    },
  };
}
```

Em `src/api/v1/controllers/usuarios/user-response.ts`, acrescentar o campo logo depois de `bypass: z.boolean(),`:

```ts
  // Recalculado no /me: false = entrou mas não tem cargo com acesso.
  acessoLiberado: z.boolean(),
```

- [ ] **Step 7: Verificar que o back sobe e o /me valida**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

`find-user-by-id.ts` e `find-users.ts` também usam `userResponse`. Como `acessoLiberado` agora é obrigatório no schema, rodar:

Run: `grep -rn "userResponse" src/api/v1/controllers/usuarios/`
Expected: aparecem `find-me.ts`, `find-user-by-id.ts`, `find-users.ts`. Para os dois últimos, que não passam pelo `findUserByIdService`, trocar o schema de resposta por `userResponse.omit({ acessoLiberado: true })` — o gate é do próprio usuário logado, não de listagem administrativa.

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 8: Commit**

```bash
git add src/api/v1/services/authorization/acesso-liberado.ts \
        src/api/v1/services/authorization/acesso-liberado.test.ts \
        src/api/v1/services/authentication/authentication-service.ts \
        src/api/v1/services/user/find-user-by-id-service.ts \
        src/api/v1/controllers/usuarios/user-response.ts \
        src/api/v1/controllers/usuarios/find-user-by-id.ts \
        src/api/v1/controllers/usuarios/find-users.ts
git commit -m "feat: login sem gate de cargo e acessoLiberado no /me"
```

---

### Task 2: Login distingue email não confirmado

Quem acabou de se cadastrar e ainda não confirmou o email recebe `UserNotConfirmedException` do Cognito, que hoje é achatado em `"Credenciais inválidas"` (`cognito-service.ts:73-81`). O app precisa distinguir esse caso para abrir a tela de código.

**Files:**
- Create: `src/errors/email-nao-confirmado-error.ts`
- Create: `src/errors/too-many-requests-error.ts`
- Modify: `src/error-handler.ts` (dois novos `instanceof`)
- Modify: `src/api/v1/services/authentication/cognito-service.ts:71-83`
- Modify: `src/api/v1/controllers/authentication/authenticate.ts` (documentar o 403 no schema, para o orval gerar o tipo)

**Interfaces:**
- Produces:
  - `EmailNaoConfirmadoError` — classe de erro; o handler responde `403 { message, code: "EMAIL_NAO_CONFIRMADO" }`.
  - `TooManyRequestsError` — classe de erro; o handler responde `429 { message }`. Usada pela Task 6 para `LimitExceededException`/`TooManyRequestsException` do Cognito, conforme o mapa de erros do spec.
  - O corpo `403` de `POST /authentication/sign/in` é consumido pela Task 8.

- [ ] **Step 1: Write the failing test**

Criar `src/api/v1/services/authentication/cognito-service.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cognito-service`
Expected: FAIL — `Failed to resolve import "@/errors/email-nao-confirmado-error"`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/errors/email-nao-confirmado-error.ts`:

```ts
export class EmailNaoConfirmadoError extends Error {
  constructor(message?: string) {
    super(message ?? "Confirme seu email para entrar");
    this.name = "EmailNaoConfirmadoError";
  }
}
```

Criar `src/errors/too-many-requests-error.ts`:

```ts
export class TooManyRequestsError extends Error {
  constructor(message?: string) {
    super(message ?? "Muitas tentativas, tente mais tarde");
    this.name = "TooManyRequestsError";
  }
}
```

Em `src/api/v1/services/authentication/cognito-service.ts`, no `.catch` (linhas 71-83), passar a tratar o caso não confirmado antes dos outros:

```ts
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
```

Acrescentar o import no topo do arquivo:

```ts
import { EmailNaoConfirmadoError } from "@/errors/email-nao-confirmado-error";
```

Em `src/error-handler.ts`, acrescentar antes do `if (error instanceof ForbiddenError)`:

```ts
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
```

com os imports correspondentes:

```ts
import { EmailNaoConfirmadoError } from "./errors/email-nao-confirmado-error";
import { TooManyRequestsError } from "./errors/too-many-requests-error";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cognito-service`
Expected: PASS, 2 testes.

- [ ] **Step 5: Documentar o 403 no schema do login**

Em `src/api/v1/controllers/authentication/authenticate.ts`, dentro de `response`, acrescentar depois do `201`:

```ts
          403: z.object({
            message: z.string(),
            code: z.literal("EMAIL_NAO_CONFIRMADO"),
          }),
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 7: Commit**

```bash
git add src/errors/email-nao-confirmado-error.ts \
        src/errors/too-many-requests-error.ts \
        src/error-handler.ts \
        src/api/v1/services/authentication/cognito-service.ts \
        src/api/v1/services/authentication/cognito-service.test.ts \
        src/api/v1/controllers/authentication/authenticate.ts
git commit -m "feat: separa email nao confirmado de credencial invalida no login"
```

---

### Task 3: `GET /public/nucleo`

O picker de núcleo do signup roda antes do login, e todas as rotas de núcleo atuais estão dentro do `authenticationMiddleware` (`src/routes/nucleos-route.ts:13`).

**Files:**
- Create: `src/api/v1/controllers/nucleos/get-public-nucleos.ts`
- Modify: `src/api/v1/models/nucleos-model.ts` (novo método `findAllPublic`)
- Modify: `src/routes/nucleos-route.ts` (registrar fora do escopo autenticado)

**Interfaces:**
- Consumes: `prisma` de `prisma/db`.
- Produces:
  - `NucleosModel.findAllPublic(): Promise<{ id: string; nome: string; regiaoNome: string | null }[]>`
  - `GET /public/nucleo` → `200: Array<{ id, nome, regiaoNome }>`, `operationId: "getPublicNucleos"` (o orval gera `useGetPublicNucleos`, consumido pela Task 7).

- [ ] **Step 1: Write the failing test**

Criar `src/api/v1/models/nucleos-model.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("prisma/db", () => ({
  prisma: { nucleos: { findMany: (args: unknown) => findMany(args) } },
}));

import { NucleosModel } from "./nucleos-model";

describe("NucleosModel.findAllPublic", () => {
  it("achata a região e esconde os campos de config", async () => {
    findMany.mockResolvedValue([
      { id: "n1", nome: "Núcleo A", regioes: { nome: "Região 1" } },
      { id: "n2", nome: "Núcleo B", regioes: null },
    ]);

    const result = await new NucleosModel().findAllPublic();

    expect(result).toEqual([
      { id: "n1", nome: "Núcleo A", regiaoNome: "Região 1" },
      { id: "n2", nome: "Núcleo B", regiaoNome: null },
    ]);
  });

  it("filtra deletados e ordena por nome", async () => {
    findMany.mockResolvedValue([]);

    await new NucleosModel().findAllPublic();

    expect(findMany).toHaveBeenCalledWith({
      where: { deletado: false },
      select: { id: true, nome: true, regioes: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- nucleos-model`
Expected: FAIL — `findAllPublic is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `src/api/v1/models/nucleos-model.ts`, acrescentar o método dentro da classe:

```ts
  /** Listagem pré-login: só o necessário para o picker de núcleo do signup. */
  async findAllPublic() {
    const nucleos = await prisma.nucleos.findMany({
      where: { deletado: false },
      select: { id: true, nome: true, regioes: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    });

    return nucleos.map((n) => ({
      id: n.id,
      nome: n.nome,
      regiaoNome: n.regioes?.nome ?? null,
    }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- nucleos-model`
Expected: PASS, 2 testes.

- [ ] **Step 5: Criar a rota**

Criar `src/api/v1/controllers/nucleos/get-public-nucleos.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { NucleosModel } from "../../models/nucleos-model";

const nucleosModel = new NucleosModel();

export async function getPublicNucleosRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/public/nucleo",
    {
      schema: {
        tags: ["Nucleos"],
        summary: "Listar núcleos (público)",
        description:
          "Lista os núcleos existentes para o picker do signup. Sem autenticação.",
        operationId: "getPublicNucleos",
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              nome: z.string(),
              regiaoNome: z.string().nullable(),
            }),
          ),
        },
      },
    },
    async (_request, reply) => {
      const nucleos = await nucleosModel.findAllPublic();
      return reply.status(200).send(nucleos);
    },
  );
}
```

Em `src/routes/nucleos-route.ts`, registrar **fora** do `app.register(async (scoped) => {...})` que aplica o `authenticationMiddleware`:

```ts
export async function registerNucleosRoutes(app: FastifyInstance) {
  // Pré-login: alimenta o picker de núcleo do signup.
  getPublicNucleosRoute(app);

  // Núcleos e regiões são provisionados no login via Cognito — só leitura.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware);
    getNucleoByIdRoute(scoped);
    getNucleoByRegionIdRoute(scoped);
    getAllNucleosRoute(scoped);
    getAllRegioes(scoped);
    getRegion(scoped);
    updateNucleoConfigRoute(scoped);
  });
}
```

com o import:

```ts
import { getPublicNucleosRoute } from "@/api/v1/controllers/nucleos/get-public-nucleos";
```

- [ ] **Step 6: Verificar que a rota responde sem token**

Run: `npm run dev` em um terminal e, em outro, `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$PORT/public/nucleo`
Expected: `200` (sem header `Authorization`, sem cookie). Encerrar o `npm run dev` depois.

- [ ] **Step 7: Commit**

```bash
git add src/api/v1/controllers/nucleos/get-public-nucleos.ts \
        src/api/v1/models/nucleos-model.ts \
        src/api/v1/models/nucleos-model.test.ts \
        src/routes/nucleos-route.ts
git commit -m "feat: rota publica de listagem de nucleos"
```

---

### Task 4: Serviço de signup no Cognito

Cria a conta no pool via API pública e grava a linha local com o núcleo escolhido. Nada de cargo: `signUp` manda só `email` e `name`.

**Files:**
- Create: `src/api/v1/services/authentication/cognito-sign-up-service.ts`
- Create: `src/api/v1/services/authentication/sign-up-service.ts`
- Create: `src/api/v1/services/authentication/sign-up-service.test.ts`

**Interfaces:**
- Consumes: `userPool` — o `CognitoUserPool` já instanciado em `cognito-service.ts:32`. Exportá-lo de lá (`export const userPool = new CognitoUserPool({...})`) em vez de criar um segundo.
- Produces:
  - `cognitoSignUp({ email, senha, nome }): Promise<{ userConfirmed: boolean }>`
  - `signUpService({ nome, email, senha, nucleoId }): Promise<{ userConfirmed: boolean }>`

- [ ] **Step 1: Write the failing test**

Criar `src/api/v1/services/authentication/sign-up-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const upsert = vi.fn();
const cognitoSignUp = vi.fn();

vi.mock("prisma/db", () => ({
  prisma: {
    nucleos: { findFirst: (a: unknown) => findFirst(a) },
    usuarios: { upsert: (a: unknown) => upsert(a) },
  },
}));

vi.mock("./cognito-sign-up-service", () => ({
  cognitoSignUp: (a: unknown) => cognitoSignUp(a),
}));

import { BadRequestError } from "@/errors/bad-request-error";
import { signUpService } from "./sign-up-service";

const params = {
  nome: "Maria Silva",
  email: "maria@example.com",
  senha: "senha12345",
  nucleoId: "nucleo-1",
};

describe("signUpService", () => {
  beforeEach(() => {
    findFirst.mockReset();
    upsert.mockReset();
    cognitoSignUp.mockReset();
    findFirst.mockResolvedValue({ id: "nucleo-1" });
    cognitoSignUp.mockResolvedValue({ userConfirmed: false });
    upsert.mockResolvedValue({ id: "user-1" });
  });

  it("rejeita núcleo inexistente sem chamar o Cognito", async () => {
    findFirst.mockResolvedValue(null);

    await expect(signUpService(params)).rejects.toBeInstanceOf(BadRequestError);
    expect(cognitoSignUp).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("cria no Cognito e grava a linha local com o núcleo escolhido", async () => {
    const result = await signUpService(params);

    expect(cognitoSignUp).toHaveBeenCalledWith({
      email: "maria@example.com",
      senha: "senha12345",
      nome: "Maria Silva",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { email: "maria@example.com" },
      create: {
        email: "maria@example.com",
        nome: "Maria Silva",
        senha: null,
        cargos: null,
        cargoNome: null,
        cargoCodigo: null,
        grau: null,
        nucleo: { connect: { id: "nucleo-1" } },
      },
      update: {
        nome: "Maria Silva",
        nucleo: { connect: { id: "nucleo-1" } },
      },
      select: { id: true },
    });

    expect(result).toEqual({ userConfirmed: false });
  });

  it("não grava nada local quando o Cognito recusa o cadastro", async () => {
    cognitoSignUp.mockRejectedValue(new Error("UsernameExistsException"));

    await expect(signUpService(params)).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sign-up-service`
Expected: FAIL — `Failed to resolve import "./sign-up-service"`.

- [ ] **Step 3: Exportar o `userPool` existente**

Em `src/api/v1/services/authentication/cognito-service.ts:32`, trocar

```ts
const userPool = new CognitoUserPool({
```

por

```ts
export const userPool = new CognitoUserPool({
```

- [ ] **Step 4: Escrever o wrapper do Cognito**

Criar `src/api/v1/services/authentication/cognito-sign-up-service.ts`:

```ts
import { CognitoUserAttribute } from "amazon-cognito-identity-js";
import { BadRequestError } from "@/errors/bad-request-error";
import { ConflictError } from "@/errors/conflict-error";
import { userPool } from "./cognito-service";

interface CognitoSignUpParams {
  email: string;
  senha: string;
  nome: string;
}

/**
 * Cria o usuário no pool do Cognito via SignUp — API pública do pool, não
 * administrativa: funciona com o app client sem secret e sem credencial IAM.
 *
 * Só `email` e `name` são enviados. Cargo e grau (`custom:cargo*`,
 * `custom:grau`) são responsabilidade do Mural Digital e nunca são escritos aqui.
 */
export async function cognitoSignUp({
  email,
  senha,
  nome,
}: CognitoSignUpParams): Promise<{ userConfirmed: boolean }> {
  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      senha,
      [
        new CognitoUserAttribute({ Name: "email", Value: email }),
        new CognitoUserAttribute({ Name: "name", Value: nome }),
      ],
      [],
      (err, result) => {
        if (err) {
          const code = (err as { code?: string; name?: string }).code;

          if (code === "UsernameExistsException") {
            return reject(
              new ConflictError(
                "Você já tem conta. Entre com a senha do Mural Digital.",
              ),
            );
          }

          if (
            code === "InvalidPasswordException" ||
            code === "InvalidParameterException"
          ) {
            // Repassa a política de senha do próprio pool, sem reinventar regra.
            return reject(new BadRequestError(err.message));
          }

          if (
            code === "LimitExceededException" ||
            code === "TooManyRequestsException"
          ) {
            return reject(new TooManyRequestsError());
          }

          return reject(err);
        }

        resolve({ userConfirmed: result?.userConfirmed ?? false });
      },
    );
  });
}
```

- [ ] **Step 5: Escrever o serviço**

Criar `src/api/v1/services/authentication/sign-up-service.ts`:

```ts
import { prisma } from "prisma/db";
import { BadRequestError } from "@/errors/bad-request-error";
import { cognitoSignUp } from "./cognito-sign-up-service";

interface SignUpParams {
  nome: string;
  email: string;
  senha: string;
  nucleoId: string;
}

export async function signUpService({
  nome,
  email,
  senha,
  nucleoId,
}: SignUpParams): Promise<{ userConfirmed: boolean }> {
  // 1. Núcleo precisa existir antes de criar qualquer coisa no Cognito.
  const nucleo = await prisma.nucleos.findFirst({
    where: { id: nucleoId, deletado: false },
    select: { id: true },
  });

  if (!nucleo) {
    throw new BadRequestError("Núcleo inválido");
  }

  // 2. Cognito é quem guarda a credencial. Se ele recusar, nada é gravado aqui.
  const { userConfirmed } = await cognitoSignUp({ email, senha, nome });

  // 3. Linha local guarda o núcleo escolhido. Sem senha (a credencial vive no
  // Cognito) e sem cargo. `syncFromCognito` preserva este nucleoId enquanto a
  // claim custom:nucleo_nome não existir.
  await prisma.usuarios.upsert({
    where: { email },
    create: {
      email,
      nome,
      senha: null,
      cargos: null,
      cargoNome: null,
      cargoCodigo: null,
      grau: null,
      nucleo: { connect: { id: nucleo.id } },
    },
    update: {
      nome,
      nucleo: { connect: { id: nucleo.id } },
    },
    select: { id: true },
  });

  return { userConfirmed };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- sign-up-service`
Expected: PASS, 3 testes.

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 8: Commit**

```bash
git add src/api/v1/services/authentication/cognito-sign-up-service.ts \
        src/api/v1/services/authentication/sign-up-service.ts \
        src/api/v1/services/authentication/sign-up-service.test.ts \
        src/api/v1/services/authentication/cognito-service.ts
git commit -m "feat: servico de signup no Cognito com nucleo escolhido"
```

---

### Task 5: Rota `POST /authentication/sign/up`

**Files:**
- Create: `src/api/v1/controllers/authentication/sign-up.ts`
- Modify: `src/routes/authentication-route.ts`

**Interfaces:**
- Consumes: `signUpService({ nome, email, senha, nucleoId })` da Task 4.
- Produces: `POST /authentication/sign/up`, `operationId: "signUp"` → `201 { userConfirmed: boolean }`. O orval gera `useSignUp`, consumido pela Task 7.

- [ ] **Step 1: Criar a rota**

Criar `src/api/v1/controllers/authentication/sign-up.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { signUpService } from "../../services/authentication/sign-up-service";

export async function signUpUser(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/sign/up",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Criar conta",
        operationId: "signUp",
        description:
          "Cria a conta no Cognito (mesma conta do Mural Digital) e guarda o núcleo escolhido. Não define cargo.",
        body: z
          .object({
            nome: z.string().min(3, "Informe seu nome completo"),
            email: z.string().email(),
            senha: z.string().min(8, "Mínimo 8 caracteres"),
            confirmarSenha: z.string(),
            nucleoId: z.string().cuid(),
          })
          .refine((data) => data.senha === data.confirmarSenha, {
            message: "As senhas não conferem",
            path: ["confirmarSenha"],
          }),
        response: {
          201: z.object({
            userConfirmed: z.boolean(),
          }),
          400: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { nome, email, senha, nucleoId } = request.body;

      const { userConfirmed } = await signUpService({
        nome: nome.trim(),
        email: email.toLowerCase().trim(),
        senha,
        nucleoId,
      });

      return reply.status(201).send({ userConfirmed });
    },
  );
}
```

- [ ] **Step 2: Registrar a rota**

Em `src/routes/authentication-route.ts`, acrescentar o import e o register:

```ts
import { signUpUser } from "@/api/v1/controllers/authentication/sign-up";
```

```ts
  app.register(signUpUser);
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 4: Verificar a validação do body**

Run: `npm run dev` em um terminal e, em outro:

```bash
curl -s -X POST http://localhost:$PORT/authentication/sign/up \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Ab","email":"nao-email","senha":"123","confirmarSenha":"456","nucleoId":"x"}'
```

Expected: `400` com `{"message":"Erro de validação","errors":{...}}` listando `nome`, `email`, `senha`, `nucleoId`. Nenhuma chamada ao Cognito. Encerrar o `npm run dev`.

- [ ] **Step 5: Commit**

```bash
git add src/api/v1/controllers/authentication/sign-up.ts src/routes/authentication-route.ts
git commit -m "feat: rota de signup"
```

---

### Task 6: Confirmação de email (`confirm` e `confirm/resend`) e rate limit

Quando `userConfirmed` vem `false`, o Cognito manda um código por email e o login falha até a confirmação. Esta task fecha o fluxo e protege as três rotas públicas.

**Files:**
- Create: `src/api/v1/services/authentication/cognito-confirm-service.ts`
- Create: `src/api/v1/services/authentication/cognito-confirm-service.test.ts`
- Create: `src/api/v1/controllers/authentication/confirm-sign-up.ts`
- Create: `src/api/v1/controllers/authentication/resend-confirmation.ts`
- Modify: `src/routes/authentication-route.ts`
- Modify: `src/app.ts` (registrar `@fastify/rate-limit`)
- Modify: `package.json` (dependência `@fastify/rate-limit`)

**Interfaces:**
- Consumes: `userPool` de `cognito-service.ts` (exportado na Task 4).
- Produces:
  - `confirmSignUp({ email, codigo }): Promise<void>`
  - `resendConfirmationCode({ email }): Promise<void>`
  - `POST /authentication/confirm`, `operationId: "confirmSignUp"` → `200 { ok: true }`
  - `POST /authentication/confirm/resend`, `operationId: "resendConfirmation"` → `200 { ok: true }`
  - Corpo `200 { ok: true }` em vez de `204`: com `fastify-type-provider-zod` o serializador ainda roda no `204`, e um schema de corpo vazio é atrito sem ganho.
  - Ambos consumidos pela Task 7.

- [ ] **Step 1: Write the failing test**

Criar `src/api/v1/services/authentication/cognito-confirm-service.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cognito-confirm-service`
Expected: FAIL — `Failed to resolve import "./cognito-confirm-service"`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/api/v1/services/authentication/cognito-confirm-service.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cognito-confirm-service`
Expected: PASS, 3 testes.

- [ ] **Step 5: Criar as duas rotas**

Criar `src/api/v1/controllers/authentication/confirm-sign-up.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { confirmSignUp } from "../../services/authentication/cognito-confirm-service";

export async function confirmSignUpRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/confirm",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Confirmar email do cadastro",
        operationId: "confirmSignUp",
        description: "Confirma o cadastro com o código enviado por email.",
        body: z.object({
          email: z.string().email(),
          codigo: z.string().min(1),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ message: z.string() }),
          429: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, codigo } = request.body;

      await confirmSignUp({
        email: email.toLowerCase().trim(),
        codigo: codigo.trim(),
      });

      return reply.status(200).send({ ok: true });
    },
  );
}
```

Criar `src/api/v1/controllers/authentication/resend-confirmation.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { resendConfirmationCode } from "../../services/authentication/cognito-confirm-service";

export async function resendConfirmationRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/authentication/confirm/resend",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Reenviar código de confirmação",
        operationId: "resendConfirmation",
        description: "Reenvia por email o código de confirmação do cadastro.",
        body: z.object({
          email: z.string().email(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ message: z.string() }),
          429: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      await resendConfirmationCode({
        email: request.body.email.toLowerCase().trim(),
      });

      return reply.status(200).send({ ok: true });
    },
  );
}
```

Em `src/routes/authentication-route.ts`, acrescentar:

```ts
import { confirmSignUpRoute } from "@/api/v1/controllers/authentication/confirm-sign-up";
import { resendConfirmationRoute } from "@/api/v1/controllers/authentication/resend-confirmation";
```

```ts
  app.register(confirmSignUpRoute);
  app.register(resendConfirmationRoute);
```

- [ ] **Step 6: Instalar e configurar o rate limit**

Run: `npm install @fastify/rate-limit`

Em `src/app.ts`, depois do `app.register(fastifyCookie);`, acrescentar:

```ts
// Rate limit global desligado; aplicado por rota (ver rotas públicas de
// autenticação). Abuso nas rotas públicas cria usuário no pool do Cognito.
app.register(fastifyRateLimit, { global: false });
```

com o import:

```ts
import fastifyRateLimit from "@fastify/rate-limit";
```

Nas três rotas públicas (`sign-up.ts`, `confirm-sign-up.ts`, `resend-confirmation.ts`), acrescentar `config` ao lado de `schema` dentro do objeto de opções:

```ts
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
```

- [ ] **Step 7: Verificar o limite na prática**

Run: `npm run dev` em um terminal e, em outro:

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:$PORT/authentication/confirm/resend \
    -H 'Content-Type: application/json' -d '{"email":"nao-existe@example.com"}'
done; echo
```

Expected: os cinco primeiros com status de aplicação (`200` ou `400`) e o sexto `429`. Encerrar o `npm run dev`.

- [ ] **Step 8: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS em todos os arquivos de teste criados nas Tasks 1-6.

- [ ] **Step 9: Commit**

```bash
git add src/api/v1/services/authentication/cognito-confirm-service.ts \
        src/api/v1/services/authentication/cognito-confirm-service.test.ts \
        src/api/v1/controllers/authentication/confirm-sign-up.ts \
        src/api/v1/controllers/authentication/resend-confirmation.ts \
        src/api/v1/controllers/authentication/sign-up.ts \
        src/routes/authentication-route.ts src/app.ts package.json package-lock.json
git commit -m "feat: confirmacao de email e rate limit nas rotas publicas"
```

---

### Task 7: Tela de signup no app

A partir daqui o trabalho é em `field-operations-tracker-app` (repositório separado; commits vão para lá).

**Files:**
- Create: `field-operations-tracker-app/app/public/signup/index.tsx`
- Create: `field-operations-tracker-app/src/schemas/sign-up-form-schema.ts`
- Regenerate: `field-operations-tracker-app/src/http/generated/**` (orval)

**Interfaces:**
- Consumes: `useSignUp`, `useGetPublicNucleos` (gerados pelo orval a partir das Tasks 3 e 5); `CustomPicker` de `@/src/components/custom-picker` — props `{ selectedValue: string; onValueChange: (v: string) => void; options: { label: string; value: string }[]; placeholder?: string; disabled?: boolean }`; `Input` de `@/src/components/ui/input`; `SecureInput` de `@/src/components/ui/secure-input`.
- Produces: rota `/public/signup`, consumida pela Task 8.

- [ ] **Step 1: Gerar o cliente HTTP**

Com o back rodando (`npm run dev` no `field-operations-tracker-api`), no `field-operations-tracker-app`:

Run: `npx orval`
Expected: `src/http/generated/authentication/authentication.ts` passa a exportar `useSignUp`, `useConfirmSignUp` e `useResendConfirmation`; `src/http/generated/nucleos/nucleos.ts` passa a exportar `useGetPublicNucleos`.

Run: `grep -rn "useSignUp\|useGetPublicNucleos\|useConfirmSignUp\|useResendConfirmation" src/http/generated --include=*.ts | head`
Expected: os quatro hooks aparecem.

- [ ] **Step 2: Criar o schema do form**

Criar `src/schemas/sign-up-form-schema.ts`:

```ts
import { z } from "zod";

export const signUpFormSchema = z
  .object({
    nome: z.string().min(3, "Informe seu nome completo"),
    email: z.string().refine((val) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(val);
    }, "Email inválido"),
    senha: z.string().min(8, "Mínimo 8 caracteres"),
    confirmarSenha: z.string(),
    nucleoId: z.string().min(1, "Escolha seu núcleo"),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não conferem",
    path: ["confirmarSenha"],
  });

export type SignUpFormSchema = z.infer<typeof signUpFormSchema>;
```

- [ ] **Step 3: Criar a tela**

Criar `app/public/signup/index.tsx`:

```tsx
import KeyboardSpacer from "@/src/components/keyboard-spacer";
import CustomPicker from "@/src/components/custom-picker";
import { Input } from "@/src/components/ui/input";
import { SecureInput } from "@/src/components/ui/secure-input";
import { useSignUp } from "@/src/http/generated/authentication/authentication";
import { useGetPublicNucleos } from "@/src/http/generated/nucleos/nucleos";
import {
  SignUpFormSchema,
  signUpFormSchema,
} from "@/src/schemas/sign-up-form-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Toast } from "toastify-react-native";

export default function SignUpPage() {
  const router = useRouter();
  const { mutateAsync: signUp } = useSignUp();
  const { data: nucleos, isLoading: loadingNucleos } = useGetPublicNucleos();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormSchema>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      nome: "",
      email: "",
      senha: "",
      confirmarSenha: "",
      nucleoId: "",
    },
  });

  const nucleoOptions = (nucleos ?? []).map((n) => ({
    label: n.regiaoNome ? `${n.nome} — ${n.regiaoNome}` : n.nome,
    value: n.id,
  }));

  const handleSignUp = useCallback(
    async (data: SignUpFormSchema) => {
      try {
        const res = await signUp({
          data: {
            nome: data.nome.trim(),
            email: data.email.toLowerCase().trim(),
            senha: data.senha,
            confirmarSenha: data.confirmarSenha,
            nucleoId: data.nucleoId,
          },
        });

        if (res.userConfirmed) {
          Toast.success("Cadastro criado, entre com sua senha");
          router.replace("/public/signin");
          return;
        }

        router.replace({
          pathname: "/public/confirm",
          params: { email: data.email.toLowerCase().trim() },
        });
      } catch (error: any) {
        Toast.error(
          error?.response?.data?.message ||
            error.message ||
            "Erro ao criar conta",
        );
      }
    },
    [signUp, router],
  );

  return (
    <View className="flex-1 bg-zinc-100">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingVertical: 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center gap-8">
          <View className="items-center gap-2">
            <Text className="text-zinc-800 text-3xl font-bold tracking-tight">
              Criar conta
            </Text>
            <Text className="text-zinc-600 text-base text-center px-4">
              Esta é a sua conta do Mural Digital. O acesso aos dados depende do
              seu cargo.
            </Text>
          </View>

          <View className="w-full bg-white rounded-3xl p-6 gap-5 border border-zinc-200">
            <Controller
              control={control}
              name="nome"
              render={({ field }) => (
                <View className="gap-2">
                  <Text className="text-zinc-700 font-semibold text-sm ml-1">
                    Nome completo
                  </Text>
                  <Input
                    value={field.value}
                    autoCapitalize="words"
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Seu nome"
                    placeholderTextColor="#a1a1aa"
                    error={!!errors.nome}
                    editable={!isSubmitting}
                  />
                  {errors.nome?.message && (
                    <Text className="text-red-500 text-xs ml-1">
                      ⚠ {errors.nome.message}
                    </Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <View className="gap-2">
                  <Text className="text-zinc-700 font-semibold text-sm ml-1">
                    Email
                  </Text>
                  <Input
                    value={field.value}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="seu@email.com"
                    placeholderTextColor="#a1a1aa"
                    error={!!errors.email}
                    editable={!isSubmitting}
                  />
                  {errors.email?.message && (
                    <Text className="text-red-500 text-xs ml-1">
                      ⚠ {errors.email.message}
                    </Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="nucleoId"
              render={({ field }) => (
                <View className="gap-2">
                  <Text className="text-zinc-700 font-semibold text-sm ml-1">
                    Núcleo
                  </Text>
                  <CustomPicker
                    selectedValue={field.value}
                    onValueChange={field.onChange}
                    options={nucleoOptions}
                    placeholder={
                      loadingNucleos
                        ? "Carregando núcleos..."
                        : "Selecione seu núcleo"
                    }
                    disabled={loadingNucleos || isSubmitting}
                  />
                  {errors.nucleoId?.message && (
                    <Text className="text-red-500 text-xs ml-1">
                      ⚠ {errors.nucleoId.message}
                    </Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="senha"
              render={({ field }) => (
                <View className="gap-2">
                  <Text className="text-zinc-700 font-semibold text-sm ml-1">
                    Senha
                  </Text>
                  <SecureInput
                    value={field.value}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="••••••••"
                    placeholderTextColor="#a1a1aa"
                    error={!!errors.senha}
                    editable={!isSubmitting}
                  />
                  {errors.senha?.message && (
                    <Text className="text-red-500 text-xs ml-1">
                      ⚠ {errors.senha.message}
                    </Text>
                  )}
                </View>
              )}
            />

            <Controller
              control={control}
              name="confirmarSenha"
              render={({ field }) => (
                <View className="gap-2">
                  <Text className="text-zinc-700 font-semibold text-sm ml-1">
                    Confirmar senha
                  </Text>
                  <SecureInput
                    value={field.value}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="••••••••"
                    placeholderTextColor="#a1a1aa"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit(handleSignUp)}
                    error={!!errors.confirmarSenha}
                    editable={!isSubmitting}
                  />
                  {errors.confirmarSenha?.message && (
                    <Text className="text-red-500 text-xs ml-1">
                      ⚠ {errors.confirmarSenha.message}
                    </Text>
                  )}
                </View>
              )}
            />

            <Pressable
              onPress={handleSubmit(handleSignUp)}
              disabled={isSubmitting}
              className="mt-2"
              accessibilityRole="button"
              accessibilityLabel="Criar conta"
              accessibilityState={{ disabled: isSubmitting }}
            >
              {({ pressed }) => (
                <View
                  className={`bg-primary h-14 rounded-xl flex items-center justify-center flex-row gap-2 ${
                    pressed ? "opacity-90" : "opacity-100"
                  } ${isSubmitting ? "opacity-70" : ""}`}
                >
                  {isSubmitting && (
                    <ActivityIndicator color="white" size="small" />
                  )}
                  <Text className="text-lg font-bold text-white">
                    {isSubmitting ? "Criando..." : "Criar conta"}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace("/public/signin")}>
              <Text className="text-center text-zinc-600 text-sm">
                Já tem conta? <Text className="font-bold">Entrar</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <KeyboardSpacer />
    </View>
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro. Se `useGetPublicNucleos` não existir, o orval do Step 1 não rodou contra o back atualizado — repetir o Step 1.

- [ ] **Step 5: Testar na prática**

Run: `npm start` e abrir o app; navegar para `/public/signup` (o link da tela de login vem na Task 8; até lá, usar deep link ou editar temporariamente o `router.replace` inicial).
Expected: picker lista os núcleos vindos de `GET /public/nucleo`; submeter com senha curta mostra erro no campo; submeter válido cria a conta e vai para a tela de confirmação (Task 8) ou signin.

- [ ] **Step 6: Commit**

```bash
git add app/public/signup/index.tsx src/schemas/sign-up-form-schema.ts src/http/generated
git commit -m "feat: tela de signup com escolha de nucleo"
```

---

### Task 8: Tela de confirmação de código e informativo no login

**Files:**
- Create: `field-operations-tracker-app/app/public/confirm/index.tsx`
- Modify: `field-operations-tracker-app/app/public/signin/index.tsx` (informativo + link + tratamento do 403)

**Interfaces:**
- Consumes: `useConfirmSignUp`, `useResendConfirmation` (orval, Task 6); rota `/public/signup` (Task 7); corpo `403 { code: "EMAIL_NAO_CONFIRMADO" }` de `POST /authentication/sign/in` (Task 2).

- [ ] **Step 1: Criar a tela de confirmação**

Criar `app/public/confirm/index.tsx`:

```tsx
import KeyboardSpacer from "@/src/components/keyboard-spacer";
import { Input } from "@/src/components/ui/input";
import {
  useConfirmSignUp,
  useResendConfirmation,
} from "@/src/http/generated/authentication/authentication";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Toast } from "toastify-react-native";

export default function ConfirmPage() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [codigo, setCodigo] = useState("");

  const { mutateAsync: confirmSignUp, isPending: confirming } =
    useConfirmSignUp();
  const { mutateAsync: resend, isPending: resending } = useResendConfirmation();

  async function handleConfirm() {
    try {
      await confirmSignUp({ data: { email, codigo: codigo.trim() } });
      Toast.success("Email confirmado, entre com sua senha");
      router.replace("/public/signin");
    } catch (error: any) {
      Toast.error(
        error?.response?.data?.message || "Código inválido ou expirado",
      );
    }
  }

  async function handleResend() {
    try {
      await resend({ data: { email } });
      Toast.success("Código reenviado");
    } catch (error: any) {
      Toast.error(
        error?.response?.data?.message || "Não foi possível reenviar",
      );
    }
  }

  return (
    <View className="flex-1 bg-zinc-100">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingVertical: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center gap-8">
          <View className="items-center gap-2">
            <Text className="text-zinc-800 text-3xl font-bold tracking-tight">
              Confirme seu email
            </Text>
            <Text className="text-zinc-600 text-base text-center px-4">
              Enviamos um código para {email}.
            </Text>
          </View>

          <View className="w-full bg-white rounded-3xl p-6 gap-5 border border-zinc-200">
            <View className="gap-2">
              <Text className="text-zinc-700 font-semibold text-sm ml-1">
                Código
              </Text>
              <Input
                value={codigo}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setCodigo}
                placeholder="000000"
                placeholderTextColor="#a1a1aa"
                editable={!confirming}
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
              />
            </View>

            <Pressable
              onPress={handleConfirm}
              disabled={confirming || codigo.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Confirmar email"
            >
              {({ pressed }) => (
                <View
                  className={`bg-primary h-14 rounded-xl flex items-center justify-center flex-row gap-2 ${
                    pressed ? "opacity-90" : "opacity-100"
                  } ${confirming ? "opacity-70" : ""}`}
                >
                  {confirming && <ActivityIndicator color="white" size="small" />}
                  <Text className="text-lg font-bold text-white">
                    {confirming ? "Confirmando..." : "Confirmar"}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={handleResend} disabled={resending}>
              <Text className="text-center text-zinc-600 text-sm">
                {resending ? "Reenviando..." : "Reenviar código"}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.replace("/public/signin")}>
              <Text className="text-center text-zinc-600 text-sm">
                Voltar para <Text className="font-bold">Entrar</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <KeyboardSpacer />
    </View>
  );
}
```

- [ ] **Step 2: Tratar o 403 de email não confirmado no login**

Em `app/public/signin/index.tsx`, no `catch` de `handleSignIn` (hoje nas linhas 61-68), passar a redirecionar antes de mostrar o toast:

```tsx
      } catch (error: any) {
        // Cadastro existe mas falta confirmar o email: manda para a tela do código.
        if (error?.response?.data?.code === "EMAIL_NAO_CONFIRMADO") {
          router.replace({
            pathname: "/public/confirm",
            params: { email: data.email.toLowerCase().trim() },
          });
          return;
        }

        const errorMessage =
          error?.response?.data?.message ||
          error.message ||
          "Erro ao fazer login";
        Toast.error(errorMessage);
        console.error("Sign in error:", error);
      }
```

- [ ] **Step 3: Acrescentar o informativo do Mural Digital**

Em `app/public/signin/index.tsx`, dentro do card branco, depois do `Pressable` do botão "Entrar" (que fecha na linha 224) e antes do `</View>` que fecha o card:

```tsx
            <View className="gap-1 pt-2 border-t border-zinc-100">
              <Text className="text-zinc-700 text-sm text-center font-semibold">
                Use sua conta do Mural Digital.
              </Text>
              <Text className="text-zinc-600 text-sm text-center">
                É o mesmo email e senha.
              </Text>
              <Pressable
                onPress={() => router.push("/public/signup")}
                accessibilityRole="button"
                accessibilityLabel="Criar conta"
              >
                <Text className="text-zinc-600 text-sm text-center mt-2">
                  Não tem conta?{" "}
                  <Text className="font-bold text-primary">Criar conta</Text>
                </Text>
              </Pressable>
            </View>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 5: Testar o ciclo completo**

Run: `npm start`
Expected: tela de login mostra o informativo e o link "Criar conta"; criar conta com email real leva à tela de código; código errado mostra "Código inválido ou expirado"; "Reenviar código" chega novo email; código certo volta ao login e o login passa.

- [ ] **Step 6: Commit**

```bash
git add app/public/confirm/index.tsx app/public/signin/index.tsx
git commit -m "feat: confirmacao de email e informativo do Mural Digital no login"
```

---

### Task 9: Tela de acesso pendente

Fecha o fluxo: quem entrou sem cargo vai para uma tela dedicada em vez das tabs.

**Files:**
- Create: `field-operations-tracker-app/app/authenticated/pending.tsx`
- Modify: `field-operations-tracker-app/src/context/auth-context.tsx` (`acessoPendente` + redirect)

**Interfaces:**
- Consumes: `acessoLiberado: boolean` do `/me` (Task 1), via `useFindMe` já usado no contexto.
- Produces: `acessoPendente: boolean` no `AuthContext`; rota `/authenticated/pending`.

- [ ] **Step 1: Regenerar o cliente para o novo campo do `/me`**

Com o back rodando:

Run: `npx orval`

Run: `grep -rn "acessoLiberado" src/http/generated | head`
Expected: o campo aparece em `FindMe201` (`src/http/generated/api.schemas.ts`).

- [ ] **Step 2: Expor `acessoPendente` e redirecionar**

Em `src/context/auth-context.tsx`:

Acrescentar ao `AuthContextProps`:

```ts
  acessoPendente: boolean;
```

Depois do cálculo de `features` (hoje nas linhas 108-112), acrescentar:

```ts
  // Entrou, mas o cargo no Mural Digital não dá acesso. Não usar
  // `permissoes.length === 0`: o cargo LOCAL (Monitor do Plantio) tem acesso e
  // nenhuma permissão.
  const acessoPendente =
    (authenticationStatus?.logged || false) && user?.acessoLiberado === false;
```

Trocar o `useEffect` de redirect (linhas 97-106) por:

```tsx
  useEffect(() => {
    if (isLoadingAuthenticationStatus || isLoading) return;
    const logged = authenticationStatus?.logged;

    if (!logged) {
      router.replace("/public/signin");
      return;
    }

    if (acessoPendente) {
      router.replace("/authenticated/pending");
      return;
    }

    router.replace("/authenticated/(tabs)");
  }, [isLoadingAuthenticationStatus, isLoading, acessoPendente]);
```

E acrescentar `acessoPendente` ao objeto passado em `AuthContext.Provider value={{ ... }}`.

- [ ] **Step 3: Criar a tela**

Criar `app/authenticated/pending.tsx`:

```tsx
import { useAuthContext } from "@/src/context/auth-context";
import { queryClient } from "@/src/lib/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export default function PendingPage() {
  const { user, logout, loggingOut } = useAuthContext();
  const [checking, setChecking] = useState(false);

  async function handleRecheck() {
    setChecking(true);
    await queryClient.invalidateQueries();
    setChecking(false);
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingVertical: 40,
        justifyContent: "center",
      }}
    >
      <View className="gap-8">
        <View className="items-center gap-4">
          <Image
            alt="Logo da aplicação"
            source={require("@/assets/images/logo.png")}
            style={{ width: 120, height: 120 }}
            resizeMode="contain"
          />
          <Text className="text-zinc-800 text-2xl font-bold">
            Acesso pendente
          </Text>
        </View>

        <View className="w-full bg-white rounded-3xl p-6 gap-4 border border-zinc-200">
          <View className="gap-1">
            <Text className="text-zinc-800 text-lg font-semibold">
              {user?.nome}
            </Text>
            <Text className="text-zinc-600 text-sm">{user?.email}</Text>
            <Text className="text-zinc-600 text-sm">
              Núcleo: {user?.nucleo?.nome ?? "—"}
            </Text>
          </View>

          <Text className="text-zinc-700 text-base">
            Sua conta ainda não tem cargo com permissão de acesso. Procure a
            direção do seu núcleo.
          </Text>

          <Text className="text-zinc-500 text-sm">
            Se o seu cargo acabou de ser cadastrado no Mural Digital, saia e
            entre novamente para atualizar.
          </Text>

          <Pressable
            onPress={handleRecheck}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel="Verificar novamente"
          >
            {({ pressed }) => (
              <View
                className={`bg-primary h-14 rounded-xl flex items-center justify-center flex-row gap-2 ${
                  pressed ? "opacity-90" : "opacity-100"
                } ${checking ? "opacity-70" : ""}`}
              >
                {checking && <ActivityIndicator color="white" size="small" />}
                <Text className="text-lg font-bold text-white">
                  {checking ? "Verificando..." : "Verificar novamente"}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={logout}
            disabled={loggingOut}
            accessibilityRole="button"
            accessibilityLabel="Sair"
          >
            <View className="h-14 rounded-xl border border-zinc-300 flex items-center justify-center">
              <Text className="text-lg font-bold text-zinc-700">
                {loggingOut ? "Saindo..." : "Sair"}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 5: Testar os dois caminhos**

Usar o mock de claims do back (`MOCK_ENABLED=true`, `MOCK_BYPASS=false`, `MOCK_GRAU=` e `MOCK_CARGOS=` vazios, com o email em `BYPASS_EMAILS`) para logar sem cargo.

Run: `npm start`
Expected: sem cargo → tela "Acesso pendente", sem tab bar, com nome/email/núcleo preenchidos; com `MOCK_CARGO_CODIGO=56` (Monitor, escopo LOCAL, zero permissões) → entra nas tabs normalmente. Esse segundo caso é o que o gate por `permissoes` vazio quebraria.

- [ ] **Step 6: Commit**

```bash
git add app/authenticated/pending.tsx src/context/auth-context.tsx src/http/generated
git commit -m "feat: tela de acesso pendente para quem nao tem cargo"
```

---

## Notas de verificação final

Depois da Task 9, com back e app rodando:

1. Signup com email novo → conta criada no pool (verificar no console do Cognito) sem `custom:cargo*`.
2. Signup com o mesmo email → `409` e a mensagem "Você já tem conta. Entre com a senha do Mural Digital.".
3. Login com essa conta → entra e cai em "Acesso pendente".
4. Núcleo escolhido aparece na tela de pendência (confirma que a linha local guardou `nucleoId`).
5. Qualquer rota protegida chamada com esse token → `403` do `permission-middleware`.
6. `npm test` no back → verde.
