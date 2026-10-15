# Camada de autenticação Cognito + cargos

Data: 2026-07-02
Escopo: `udv-sus-back` (principal), `udv-sus-web` (remoção da criação de usuário + regen de tipos). `udv-sus-app` sem mudanças.

## Objetivo

Adicionar uma camada inicial de autenticação no Amazon Cognito antes do login local.
O Cognito passa a ser a **fonte de verdade** das credenciais. Após validar no Cognito,
o backend emite o nosso próprio JWT (fluxo atual). Os cargos vindos do JWT do Cognito
são persistidos localmente e expostos ao front via `/user/find/me`.

## Decisões (aprovadas)

- **Backend orquestra**: front manda email/senha para o nosso `/authentication/sign/in`; o backend chama o Cognito.
- **Cognito = fonte de verdade**: sem `bcrypt`. A senha não é mais validada localmente.
- **Auto-provisiona**: usuário que existe no Cognito mas não no DB local é criado na hora, com os dados do JWT do Cognito.
- **Cargos persistidos + expostos no `/find/me`** (não no nosso JWT).
- **Lista de cargos de interesse**: apenas exposta agora; vira constante para autorização futura.
- **SDK**: `@aws-sdk/client-cognito-identity-provider` (v3). Client público (sem secret) → sem `SECRET_HASH`.
- **Config Cognito**: apenas no `.env` do backend.
- **Remoção da criação de usuário**: apenas no front (web). Endpoint `create-user` do backend mantido (usado só internamente; some do fluxo manual). Re-avaliar remoção do backend depois.

## Pré-requisito operacional

O app client do Cognito (`7lcqn8l4s2uth5qh2kmif2bap3`) precisa ter o auth flow
`ALLOW_USER_PASSWORD_AUTH` habilitado, senão `InitiateAuth USER_PASSWORD_AUTH` falha.

## Fluxo novo — `POST /authentication/sign/in`

```
front → POST /sign/in {email, password}
  1. cognitoSignIn(email, password)          // InitiateAuth USER_PASSWORD_AUTH
       ok  → decodifica IdToken → claims
       erro (NotAuthorized/UserNotFound) → BadRequestError("Credenciais inválidas")
  2. busca usuário local por email
       não existe → auto-provisiona (cria com dados do Cognito, senha: null)
  3. atualiza cargoNome / cargoCodigo / cargos do usuário local (sync a cada login)
  4. emite NOSSO accessToken + refreshToken (RS256) → cookies httpOnly  // igual hoje
  5. responde { accessToken, refreshToken }                            // igual hoje
```

Claims lidos do IdToken do Cognito:
- `email`
- `name` (fallback: `given_name` / `cognito:username`) → `nome`
- `custom:cargos` → string de IDs separada por vírgula (armazenada crua)
- `custom:cargo_nome` → cargo principal (nome)
- `custom:cargo_codigo` → cargo principal (código)

## Componentes

### Backend (`udv-sus-back`)

1. **`.env`** — adicionar:
   ```
   COGNITO_REGION=us-east-1
   COGNITO_USER_POOL_ID=us-east-1_QCJtSIWeq
   COGNITO_USER_POOL_CLIENT_ID=7lcqn8l4s2uth5qh2kmif2bap3
   ```

2. **`src/env/index.ts`** — adicionar ao `envSchema`:
   `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_USER_POOL_CLIENT_ID` (todos `z.string()`).

3. **`prisma/schema.prisma`** — model `Usuarios`:
   ```prisma
   senha        String?   // era obrigatório; Cognito é fonte de verdade
   cargoNome    String?   // custom:cargo_nome
   cargoCodigo  String?   // custom:cargo_codigo
   cargos       String?   // custom:cargos — IDs crus separados por vírgula
   ```
   + migration.

4. **`package.json`** — nova dependência `@aws-sdk/client-cognito-identity-provider`.

5. **Novo `src/api/v1/services/authentication/cognito-service.ts`**
   - `cognitoSignIn({ email, password })`:
     - `CognitoIdentityProviderClient({ region: env.COGNITO_REGION })`
     - `InitiateAuthCommand` com `AuthFlow: "USER_PASSWORD_AUTH"`, `ClientId: env.COGNITO_USER_POOL_CLIENT_ID`, `AuthParameters: { USERNAME, PASSWORD }`
     - decodifica `AuthenticationResult.IdToken` com `jsonwebtoken.decode` (sem verify — veio direto da AWS via TLS)
     - retorna `{ email, nome, cargos, cargoNome, cargoCodigo }`
     - erros do Cognito (`NotAuthorizedException`, `UserNotFoundException`) → `BadRequestError("Credenciais inválidas")`

6. **Novo `src/api/v1/constants/cargos.ts`**
   - `CARGOS_DE_INTERESSE`: mapa `id → nome` com a lista fornecida (1,2,3,4,35,36,37,21,22,23,26,27,40,56,47,48,49). Só constante; sem lógica de autorização agora.

7. **`src/api/v1/services/authentication/authentication-service.ts`** (reescrito):
   - chama `cognitoSignIn`
   - `usuariosModel.findByEmail(email)` → se não existir, `usuariosModel.provisionFromCognito(claims)`
   - `usuariosModel.syncCargos(userId, claims)` (atualiza cargo*)
   - retorna `{ user }` (sem senha)

8. **`src/api/v1/models/usuarios-model.ts`**:
   - `findByEmail` passa a retornar o registro (ou `null`) para checagem de existência (ajustar `findByEmailService`/consumidores conforme necessário — hoje usa `findUniqueOrThrow`).
   - novo `provisionFromCognito({ email, nome, cargos, cargoNome, cargoCodigo })`: `prisma.usuarios.create` com `senha: null`, `permissoes: []`.
   - novo `syncCargos(id, { cargos, cargoNome, cargoCodigo })`: `prisma.usuarios.update`.
   - `findById` já retorna os campos escalares novos (cargo*) automaticamente.

9. **`src/api/v1/controllers/usuarios/create-user.ts`** — `userResponse` schema:
   - adicionar `cargoNome: z.string().nullable()`, `cargoCodigo: z.string().nullable()`, `cargos: z.array(z.string())`.
   - `find-user-by-id-service` (ou o controller `find-me`) transforma a string `cargos` em array antes de responder (`cargos?.split(",").filter(Boolean) ?? []`).

10. Controller `authenticate.ts` — **sem mudança** (ainda emite o nosso JWT com `userId`).

### Web (`udv-sus-web`)

11. **Remover criação de usuário**:
    - `pages/usuarios.tsx`: remover botão "Novo usuário" (e `canManage` → navigate `/usuarios/novo`).
    - `App.tsx`: remover rota `/usuarios/novo`.
    - `pages/usuario-form.tsx`: virar edit-only — remover branch de create, `useCreateUser`, campo **senha** (Cognito é dono da senha) e o `buildSchema(isEdit=false)`. Guard passa a exigir `id`.

12. **Regen de tipos**: `yarn generate:api` (orval, backend rodando) → `FindMe201` ganha `cargoNome`, `cargoCodigo`, `cargos`.

### App mobile (`udv-sus-app`)

Sem mudanças. Usa o mesmo `/sign/in` + `/find/me`; os cargos fluem no payload de `/find/me`. Sem config Cognito (backend orquestra).

## Fora de escopo (YAGNI)

- Lógica de autorização baseada em cargos (só expor agora).
- Verificação do JWT do Cognito via JWKS (decode direto basta — token vem da AWS via TLS).
- Refresh do token do Cognito (usamos o nosso refresh token).
- Remoção do endpoint `create-user` do backend.
- Exibição de cargos em telas do front (só disponibilizar o dado).

## Notas

- Repositório não é git (`git: false`) → spec não será commitada.
- Após alterar o schema Prisma: rodar migration + `prisma generate`.
