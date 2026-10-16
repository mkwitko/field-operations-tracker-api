# Provisionamento e autorização a partir do Cognito (fase 2)

Data: 2026-07-02
Depende de: `2026-07-02-cognito-auth-layer-design.md` (camada Cognito já implementada).
Escopo: `field-operations-tracker-api` (principal), `field-operations-tracker-web` (remover gestão manual + regen), `field-operations-tracker-app` (gate de acesso + regen).

## Objetivo

Tudo passa a ser provisionado a partir do token do Cognito a cada login:
núcleo, região, grau, cargos e **permissões** (derivadas do cargo). Gestão manual
de usuários/núcleos/regiões é removida. Acesso ao app mobile é restrito.

## Claims do Cognito usados

- `custom:nucleo_nome` — ex. "N. Mestre José Carvalho"
- `custom:regiao_nome` — ex. "9ª Região"
- `custom:grau` — ex. "QM", "CI" (QM libera acesso)
- `custom:cargos` — **todos os cargos, em TEXTO, separados por vírgula** (fonte principal)
- `custom:cargo_codigo` — só o cargo mais alto (código numérico) — fallback

> ⚠️ O formato real de `custom:cargos` (texto vs código) será confirmado pelo log
> de debug (`[Cognito] IdToken claims`) antes de finalizar o matcher. O matcher
> casa por nome normalizado E por código, então funciona nos dois formatos.

## Decisões (aprovadas)

- **Acesso ao APP mobile**: só entra quem for `grau === "QM"` **OU** tiver bypass **OU** tiver algum cargo da lista de interesse. Senão → login rejeitado (403 "Sem acesso ao aplicativo").
- **Bypass**: coluna `bypass Boolean` em `Usuarios`, setada no login a partir de `BYPASS_EMAILS` (.env). Bypass = acesso garantido + escopo REGIONAL (vê tudo)..
- **Permissões 100% automáticas do cargo** (a cada login). Sem atribuição manual.
- **Núcleo e Região provisionados do token**: cria se não existir (match por nome), faz attach. Núcleo → Região; Usuário → Núcleo.
- **Remover toda gestão manual** (criar/editar/excluir) de usuários, núcleos e regiões — front web + endpoints backend. Sobra leitura/listagem.
- **Escopo de dados regional = ver tudo** (comportamento atual, `VER_REGIOES`). Sem filtro por região do usuário.
- Fonte de checagem de cargo = `custom:cargos` (lista completa), não só o cargo_codigo.

## Mapa cargo → escopo → permissões

**Ninguém recebe `ADMINISTRADOR`.** Só permissões VER/EXPORTAR.

| Cargos (código) | Escopo | Permissões atribuídas |
|---|---|---|
| 1, 2, 3, 4, 35, 36, 37, 21, 22, 23, 26, 27, 40, 47, 48, 49 | REGIONAL | `VER_REGIOES`, `EXPORTAR_REGIOES` |
| 56 (Monitor Plantio Local) | LOCAL | nenhuma (acessa sem ser QM; vê só o próprio núcleo) |
| (sem cargo) + `grau === "QM"` | NUCLEO | `VER_NUCLEOS`, `EXPORTAR_NUCLEOS` |
| bypass (dev) | REGIONAL | `VER_REGIOES`, `EXPORTAR_REGIOES` |

Vários cargos/graus → vale o **maior escopo**. Rank: `REGIONAL > NUCLEO > LOCAL`.

### Config declarativa (fácil manutenção)

Toda a regra vive em `src/api/v1/constants/cargos.ts` — trocar/adicionar cargo = editar 1 linha:

```ts
export type Escopo = "REGIONAL" | "NUCLEO" | "LOCAL";

export const ESCOPO_PERMISSOES: Record<Escopo, PermissionName[]> = {
  REGIONAL: [VER_REGIOES, EXPORTAR_REGIOES],
  NUCLEO:   [VER_NUCLEOS, EXPORTAR_NUCLEOS],
  LOCAL:    [],
};

export const ESCOPO_RANK: Record<Escopo, number> = { REGIONAL: 3, NUCLEO: 2, LOCAL: 1 };

export const GRAU_ACESSO = "QM";        // grau que libera acesso base
export const ESCOPO_QM_PURO: Escopo = "NUCLEO"; // QM sem cargo de interesse

// Editar AQUI para trocar/adicionar cargos:
export const CARGOS: { codigo: number; nome: string; escopo: Escopo }[] = [
  { codigo: 1,  nome: "Mestre Geral Representante",        escopo: "REGIONAL" },
  { codigo: 2,  nome: "MESTRE ASSISTENTE GERAL",           escopo: "REGIONAL" },
  { codigo: 3,  nome: "PRESIDENTE DG",                     escopo: "REGIONAL" },
  { codigo: 4,  nome: "VICE-PRESIDENTE DG",                escopo: "REGIONAL" },
  { codigo: 35, nome: "MESTRE CENTRAL",                    escopo: "REGIONAL" },
  { codigo: 36, nome: "MESTRE ASSISTENTE CENTRAL",         escopo: "REGIONAL" },
  { codigo: 37, nome: "Coordenador Regional da DG",        escopo: "REGIONAL" },
  { codigo: 21, nome: "DIRETOR(A) DO PLANTIO DG",          escopo: "REGIONAL" },
  { codigo: 22, nome: "DIRETOR(A) ADJUNTO(A) PLANTIO DG",  escopo: "REGIONAL" },
  { codigo: 23, nome: "Vice-Diretor(a) do Plantio DG",     escopo: "REGIONAL" },
  { codigo: 26, nome: "1º SECRETÁRIO(A) PLANTIO DG",       escopo: "REGIONAL" },
  { codigo: 27, nome: "2º SECRETÁRIO(A) PLANTIO DG",       escopo: "REGIONAL" },
  { codigo: 40, nome: "COORDENADOR(A) REGIONAL DO PLANTIO",escopo: "REGIONAL" },
  { codigo: 47, nome: "MESTRE REPRESENTANTE",              escopo: "REGIONAL" },
  { codigo: 48, nome: "RESPONSÁVEL PELA DAV",              escopo: "REGIONAL" }, // = 47
  { codigo: 49, nome: "PRESIDENTE LOCAL",                  escopo: "REGIONAL" },
  { codigo: 56, nome: "MONITOR(A) DO PLANTIO LOCAL",       escopo: "LOCAL" },
];
```

Matcher casa `custom:cargos` por **nome normalizado** (lower + sem acento + trim) e
`custom:cargo_codigo` por código — funciona se o claim vier em texto ou número.

### Derivação de acesso (`derive-access.ts`)

```
escopos = cargosCasados.map(c => c.escopo)
if (grau === GRAU_ACESSO) escopos.push(ESCOPO_QM_PURO)
if (bypass)               escopos.push("REGIONAL")
podeAcessar = bypass || grau === GRAU_ACESSO || cargosCasados.length > 0
maiorEscopo = escopos com maior ESCOPO_RANK (ou LOCAL)
permissoes  = ESCOPO_PERMISSOES[maiorEscopo]
```

## Componentes

### Backend (`field-operations-tracker-api`)

1. **`.env` + `env/index.ts`** — `BYPASS_EMAILS` (lista separada por vírgula).

2. **`prisma/schema.prisma`** — `Usuarios`: `+grau String?`, `+bypass Boolean @default(false)`. (cargo* já existem da fase 1.)

3. **`constants/cargos.ts`** — evoluir para tabela canônica:
   `{ codigo: number, nome: string, escopo: "ADMIN"|"REGIONAL"|"LOCAL" }[]`
   cobrindo a lista de interesse. Helpers: `matchCargos(cargosClaim, cargoCodigo)` → `{ codigos, escopoMaior, temCargoDeInteresse }`.

4. **Novo `src/api/v1/services/authorization/derive-access.ts`**
   - `deriveAccess({ grau, cargosClaim, cargoCodigo, bypass })` → `{ podeAcessar: boolean, permissoes: PermissionName[] }`.
   - Regra: `podeAcessar = bypass || grau==="QM" || temCargoDeInteresse`.
   - Permissões: bypass/ADMIN → `[ADMINISTRADOR]`; REGIONAL → `[VER_REGIOES, EXPORTAR_REGIOES]`; LOCAL → `[]`.

5. **`cognito-service.ts`** — estender `CognitoClaims`: `+grau`, `+nucleoNome`, `+regiaoNome`. (log de debug dev-only já existe.)

6. **`authentication-service.ts`** (reescrito):
   - `claims = cognitoSignIn(...)`
   - `bypass = BYPASS_EMAILS.includes(claims.email)`
   - `access = deriveAccess({ grau, cargosClaim, cargoCodigo, bypass })`
   - se `!access.podeAcessar` → `ForbiddenError("Sem acesso ao aplicativo")`
   - provisiona/atualiza: região (upsert por nome) → núcleo (upsert por nome, attach região) → usuário (upsert por email, attach núcleo), grau, cargos, bypass
   - **set** das permissões do usuário = `access.permissoes` (connect/set na relação `Permissoes`)
   - retorna `{ user }` completo

7. **`usuarios-model.ts`** — métodos de provisionamento:
   - `upsertRegiaoByNome(nome)`, `upsertNucleoByNome(nome, regiaoId)` (findFirst case-insensitive + create)
   - `provisionFromCognito` / `syncFromCognito` — grava núcleo, grau, cargo*, bypass e faz `set` de permissões
   - **remover** `create`/`update`/`exclude` manuais (ver item 9)

8. **`userResponse`** (create-user.ts → mover schema p/ lugar neutro, ex. `usuarios/user-response.ts`) — `+grau`, `+bypass`, `+nucleo.regiao` já existe. Mantém `cargos[]`.

9. **Remover gestão manual (backend)**:
   - Usuários: rotas/controllers/services de `create`, `update`, `delete`, `init`. Mantém `find-me`, `find-users`, `find-user-by-id`.
   - Núcleos: `create`, `update`, `delete`. Mantém `get-all`, `get-by-id`.
   - Regiões: `create`, `update`, `delete`. Mantém `get-all`, `get-by-id`.
   - Ajustar `routes/*` e `permission-middleware` usages órfãos.
   - `userResponse` não pode mais viver em `create-user.ts` (removido) → mover.

### Web (`field-operations-tracker-web`)

10. **Remover telas de gestão**:
    - Páginas `usuario-form`, `nucleo-form`, `regiao-form` e rotas `/novo` e `/:id` correspondentes.
    - Botões "Novo …" e ações editar/excluir em `usuarios`, `nucleos`, `regioes` (viram listagem read-only).
    - `PANEL_ACCESS_PERMISSIONS` / `protected-route`: revisar — sem `CRIAR_*`, acesso ao painel passa a exigir `ADMINISTRADOR` ou `VER_REGIOES` (leitura). **(assunção — confirmar)**
11. **Regen** `yarn generate:api`.

### App mobile (`field-operations-tracker-app`)

12. **Gate de acesso**: o login já é rejeitado no backend (403) para quem não tem acesso, então o app só precisa tratar o erro na tela de signin (mensagem "Sem acesso ao aplicativo"). Sem tela extra.
13. **Regen** orval (para tipos `grau`, `bypass`, `cargos`).

## Fora de escopo (YAGNI)

- Filtro de dados por região/núcleo do próprio usuário (regional = vê tudo).
- Fluxo de troca de senha (newPasswordRequired → tratado como credencial inválida).
- Autorização por cargo além do mapa acima.

## Pontos a confirmar

- Formato real de `custom:cargos` (texto/código) — via log de debug.
- Acesso ao painel web após remover `CRIAR_*` (assunção: `ADMINISTRADOR` ou `VER_REGIOES`).

## Notas

- Repositório não é git → spec não commitada.
- Após mudar schema: aplicar colunas no DB (ALTER direcionado — evitar `db push` por causa da tabela `eventosTracking` não modelada) + `prisma generate`.
- Remover `console.log("Cognito claims")` do `authentication-service` na reescrita.
