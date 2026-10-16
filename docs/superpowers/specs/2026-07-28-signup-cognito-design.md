# Signup com escolha de núcleo e acesso pendente

Data: 2026-07-28
Repos afetados: `field-operations-tracker-api`, `field-operations-tracker-app`

## Problema

Hoje só existe login. A criação de conta acontece fora do sistema (Mural Digital), e
quem não tem cargo com permissão recebe `403 Sem acesso ao aplicativo` no login
(`authentication-service.ts:52`) — não entra e não recebe explicação nenhuma.

Queremos:

1. Tela de signup no app, onde a pessoa escolhe o núcleo entre os que já existem.
2. A conta é criada no Cognito (mesma conta do Mural Digital), via API pública.
3. Quem não tem cargo consegue entrar, mas vê uma tela explicando que falta permissão.

## Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Onde nasce a credencial | Cognito, via `userPool.signUp()` do `amazon-cognito-identity-js` | API pública (sem IAM, sem env nova). Uma única fonte de credencial — sem senha local, sem bcrypt, sem fallback duplo de autenticação. |
| Check de "já existe" | `UsernameExistsException` do próprio `signUp` | Sem `AdminGetUser`, não há como consultar existência sem credencial IAM. O erro do `signUp` entrega o mesmo resultado de graça. |
| Onde persiste o núcleo escolhido | Nosso banco (`Usuarios.nucleoId`) | Gravar `custom:nucleo_nome` no Cognito depende do app client ter permissão de write no atributo custom, o que não é verificável sem acesso ao pool. O nosso banco está sob nosso controle. |
| Gate de "sem cargo" | `acessoLiberado: boolean` recalculado no `/me` por `deriveAccess` | Lista de permissões vazia **não** serve de gate: `ESCOPO_PERMISSOES.LOCAL` é `[]` (`constants/cargos.ts:22`), então o cargo 56 (Monitor do Plantio Local) tem acesso e nenhuma permissão. Recalcular a partir de `grau`/`cargos`/`cargoCodigo`/`bypass` já persistidos mantém uma única fonte de verdade e zero migration. |
| Nunca criar cargo | `signUp` não envia `custom:cargo*` nem `custom:grau` | Cargo é responsabilidade do Mural Digital. |

## Fluxo de credencial (back)

Login continua exclusivamente Cognito SRP. Mudanças:

1. `authentication-service.ts` — remover o gate:
   ```ts
   if (!access.podeAcessar) throw new ForbiddenError("Sem acesso ao aplicativo")
   ```
   Credencial válida sempre emite token.
2. `derive-access.ts` — **não muda**. `podeAcessar` continua sendo calculado; ele deixa
   de bloquear o login e passa a ser a fonte do `acessoLiberado` exposto ao app.
3. `find-user-by-id-service.ts` + `user-response.ts` — o `/me` ganha
   `acessoLiberado: boolean`, calculado com `deriveAccess({ grau, cargosClaim: cargos, cargoCodigo, bypass })`
   a partir dos campos já persistidos no `Usuarios`. Não é coluna no banco: cargo já
   está gravado, então derivar evita uma segunda fonte de verdade.
4. `cognito-service.ts:73-81` — separar `UserNotConfirmedException` dos outros erros
   de credencial, devolvendo um erro próprio (`EmailNaoConfirmadoError`, 403 com
   `code: "EMAIL_NAO_CONFIRMADO"`) para o app abrir a tela de confirmação.

As rotas protegidas não precisam de mudança: `permission-middleware.ts` consulta as
permissões no banco a cada request, então usuário sem permissão recebe 403 em tudo
automaticamente.

Exposição de existência de conta: `UserNotConfirmedException` e
`UsernameExistsException` revelam que um email existe no pool. Aceito — é inerente a
qualquer fluxo de signup self-service, e as mensagens de credencial inválida seguem
uniformes (`"Credenciais inválidas"` para senha errada e para usuário inexistente).

## Signup (back)

`POST /authentication/sign/up` — público, registrado em `authentication-route.ts`.

Body (zod):

- `nome`: string, min 3
- `email`: email, normalizado com `.toLowerCase().trim()`
- `senha`: string, min 8
- `confirmarSenha`: string, `.refine` de igualdade com `senha`
- `nucleoId`: cuid

`sign-up-service.ts`:

1. Busca o núcleo por `nucleoId` (`deletado: false`). Não existe → `BadRequestError`.
2. `userPool.signUp(email, senha, [{ Name: "email", Value: email }, { Name: "name", Value: nome }], [])`.
   Usa `amazon-cognito-identity-js` (mesmo módulo do login) em vez do `SignUpCommand` do
   `@aws-sdk/client-cognito-identity-provider`: as duas rodam sem IAM, mas o
   `amazon-cognito-identity-js` já está provado neste código para chamada não
   autenticada (`cognito-service.ts`) e não depende da cadeia de credenciais do SDK v3.
   O app client é público (sem secret), então nenhuma das rotas precisa de `SecretHash`.
3. Sucesso → `prisma.usuarios.upsert({ where: { email } })` com
   `{ email, nome, nucleoId, senha: null, cargos: null, grau: null, cargoNome: null, cargoCodigo: null }`.
   Sem permissões conectadas. Upsert (não create) porque a linha pode já existir de um
   login Cognito anterior cujo usuário foi apagado só do pool.
4. Responde `201 { userConfirmed: boolean }`.

O núcleo escolhido sobrevive ao primeiro login porque `syncFromCognito` faz upsert por
email e só sobrescreve `nucleoId` quando a claim `custom:nucleo_nome` existe
(`usuarios-model.ts:108`). Quando o Mural Digital definir o núcleo oficial, a claim
substitui a escolha do signup.

Se o email já existe no nosso banco mas o `signUp` no Cognito passa (cenário de
inconsistência), o upsert por email reaproveita a linha em vez de violar a unique.

### Confirmação de email

`signUp` devolve `userConfirmed`. Quando `false`, o Cognito envia código por email e o
login falha com `UserNotConfirmedException` até a confirmação. Dois endpoints públicos:

- `POST /authentication/confirm` — body `{ email, codigo }` → `cognitoUser.confirmRegistration(codigo, true)`
- `POST /authentication/confirm/resend` — body `{ email }` → `cognitoUser.resendConfirmationCode()`

Se o pool tiver PreSignUp Lambda de auto-confirm, `userConfirmed` vem `true` e o app
pula a tela de código. Os endpoints continuam válidos e sem uso nesse caso.

### Rate limit

`@fastify/rate-limit` (dependência nova no back) nas três rotas públicas
(`sign/up`, `confirm`, `confirm/resend`): 5 requisições por IP por hora. Sem isso, um
abuso enche o **pool do Cognito** de usuários, não só a nossa tabela.

## Núcleos público (back)

`GET /public/nucleo` — novo, fora do `authenticationMiddleware` (as rotas de núcleo
atuais são todas protegidas, `nucleos-route.ts:13`).

Resposta: array de `{ id, nome, regiaoNome: string | null }`, filtrando
`deletado: false`, ordenado por `nome`. Região vem achatada (não o objeto de
`nucleosResponse`) porque o único consumidor é o label do picker. Não expõe
`estoqueAtivo` nem contagem de usuários — é dado pré-autenticação.

A lista contém os núcleos provisionados por logins Cognito anteriores
(`upsertNucleoByNome`), que é exatamente "os que já existem".

## App (Expo)

### Telas novas

`app/public/signup/index.tsx` — `react-hook-form` + `zodResolver`, mesmo padrão do
signin. Campos: nome, email, senha, confirmar senha, picker de núcleo
(`src/components/custom-picker.tsx`, alimentado por `GET /public/nucleo`). Ao concluir:
`userConfirmed === false` → `router.push("/public/confirm?email=...")`; `true` → volta ao
signin com toast "Cadastro criado, entre com sua senha".

`app/public/confirm/index.tsx` — input do código de 6 dígitos + botão "Reenviar código".
Confirmado → signin com toast.

### Informativo no signin

Em `app/public/signin/index.tsx`, abaixo do botão Entrar:

> **Use sua conta do Mural Digital.** É o mesmo email e senha.
> Não tem conta? **Criar conta**

"Criar conta" navega para `/public/signup` — que cria a conta no Cognito, ou seja é a
conta do Mural Digital mesmo.

O `catch` do `handleSignIn` (`signin/index.tsx:61`) passa a checar o código
`EMAIL_NAO_CONFIRMADO` e redirecionar para `/public/confirm` em vez de só exibir toast.

### Tela de acesso pendente

`src/context/auth-context.tsx` ganha `acessoPendente = isAuthenticated && user?.acessoLiberado === false`,
exposto no contexto. O `useEffect` de redirect (`auth-context.tsx:97-106`) manda para
`/authenticated/pending` quando pendente, em vez de `/authenticated/(tabs)`.

`app/authenticated/pending.tsx` (fora de `(tabs)`, sem tab bar):

```
┌────────────────────────┐
│        [logo]          │
│   Acesso pendente      │
│                        │
│ Maria Silva            │
│ maria@ex.com           │
│ Núcleo: Mestre Irineu  │
│                        │
│ Sua conta ainda não    │
│ tem cargo com          │
│ permissão de acesso.   │
│ Procure a direção do   │
│ seu núcleo.            │
│                        │
│ [ Verificar novamente ]│
│ [ Sair ]               │
└────────────────────────┘
```

"Verificar novamente" = `queryClient.invalidateQueries` do `/me` (pega liberação feita
no nosso banco). O texto acrescenta: se o cargo foi criado agora no Mural Digital, sair
e entrar de novo. Não há como re-consultar o Cognito sem re-autenticar.

### Cliente HTTP

`src/http/generated/` é gerado por orval a partir do swagger do back
(`orval.config.ts`). Os hooks (`useSignUp`, `useConfirm`, `useResendConfirmation`,
`useGetPublicNucleos`) saem de `npx orval` com o back rodando — nada escrito à mão nesse
diretório.

## Mapa de erros

| Cognito | HTTP | Mensagem |
| --- | --- | --- |
| `UsernameExistsException` | 409 | "Você já tem conta. Entre com a senha do Mural Digital." |
| `InvalidPasswordException`, `InvalidParameterException` | 400 | mensagem de política do próprio Cognito |
| `CodeMismatchException`, `ExpiredCodeException` | 400 | "Código inválido ou expirado" |
| `UserNotConfirmedException` (login) | 403 | `code: "EMAIL_NAO_CONFIRMADO"` |
| `NotAuthorizedException`, `UserNotFoundException` (login) | 400 | "Credenciais inválidas" |
| `LimitExceededException`, `TooManyRequestsException` | 429 | "Muitas tentativas, tente mais tarde" |
| outros | 500 | mensagem genérica, sem detalhe de infra |

## Testes (vitest, back)

Cognito mockado em todos os casos.

- `sign-up-service`: `nucleoId` inexistente → 400; `UsernameExistsException` → 409;
  sucesso → linha local criada com `nucleoId` correto e `senha: null`; senha fraca →
  400 com a mensagem do Cognito.
- `authentication-service`: sem cargo e sem grau → token emitido (antes era 403);
  claims sem `custom:nucleo_nome` → `nucleoId` do signup preservado.
- `acesso-liberado` (o cálculo exposto no `/me`): sem cargo e sem grau → `false`;
  cargo 56 (LOCAL, `permissoes: []`) → `true`; grau QM sem cargo → `true`. Esse último
  par é a razão de o gate não ser `permissoes.length === 0`.
- `confirm`: código errado → 400.

## Fora de escopo

- Recuperação de senha ("esqueci minha senha") — fluxo separado.
- Fluxo de `newPasswordRequired` (primeiro acesso com senha temporária), que hoje é
  tratado como credencial inválida (`cognito-service.ts:67`).
- Interface para a direção atribuir cargo/permissão — cargo continua vindo do Mural
  Digital.
- Migration de schema: nenhuma necessária.
