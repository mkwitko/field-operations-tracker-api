# Signup no Cognito — pendências e verificações manuais

Data: 2026-07-28
Complementa: `2026-07-28-signup-cognito-design.md`
Branch: `feat/signup-cognito` (repos `field-operations-tracker-api` e `field-operations-tracker-app`)

## Correção do spec

O spec original afirmava (seção "Fluxo de credencial (back)"):

> As rotas protegidas não precisam de mudança: `permission-middleware.ts` consulta as
> permissões no banco a cada request, então usuário sem permissão recebe 403 em tudo
> automaticamente.

**Isso era falso.** `requirePermission` nunca foi registrado em nenhuma rota deste
projeto — os únicos hits de grep são a própria definição e o docstring. Todos os
escopos protegidos registravam só o `authenticationMiddleware`, então autenticação era
a única barreira real e o `403 Sem acesso ao aplicativo` do login era a autorização de
fato.

Como a feature remove aquele gate do login e adiciona signup público, a branch abriria
todas as rotas autenticadas para qualquer pessoa recém-cadastrada. Corrigido com o
preHandler `requireAcessoLiberado` (`src/middlewares/acesso-liberado-middleware.ts`),
que reusa o helper `acessoLiberado()` e está registrado em todos os escopos protegidos,
exceto:

- `GET /user/find/me` — deliberadamente fora: a tela de acesso pendente do app depende
  dele.
- `GET /public/nucleo` — pública por desenho (picker do signup).
- `GET /auth/google/callback` — quem chama é o Google, sem JWT. Gatear quebraria o OAuth.
- `DELETE /auth/cleanup` — nunca teve autenticação; ver pendências abaixo.

## Verificações que exigem ambiente real

Nada disso foi verificado, por falta de device, email e produção:

1. Ciclo completo de signup com email de verdade: código chegando, confirmação,
   primeiro login.
2. Rate limit de 5/hora respondendo 429 em produção. Depende do `trustProxy: 1`
   configurado em `src/app.ts` casar com a quantidade real de proxies na frente do
   backend. Com o número errado, `req.ip` volta a ser o endereço do proxy e o limite
   passa a ser um balde único compartilhado por todos os usuários. O store é em
   memória: o limite zera em cada deploy.
3. **Se o pool do Cognito permite auto-registro.** Se "allow users to sign themselves
   up" estiver desligado no app client, `userPool.signUp` devolve
   `NotAuthorizedException`, que hoje cai no ramo não mapeado de
   `cognito-sign-up-service.ts` e vira um 500 genérico em vez de mensagem legível.
   Verificar antes de liberar a tela para os núcleos.
4. Renderização das três telas novas (signup, confirmação, acesso pendente) e o
   comportamento do picker de núcleo populado.

## Follow-ups conhecidos (fora do escopo desta branch)

Encontrados durante a revisão, não corrigidos:

- **`state` do OAuth Google não é assinado.** `google-oauth/oauth.ts:32-35` monta o
  `state` como base64 de JSON puro, sem HMAC. Alguém pode forjar um `state` com o
  `usuarioId` de outra pessoa, completar o consentimento no Google e vincular os
  próprios tokens à conta da vítima em `callback.ts:64-104`. Independe desta feature.
- **`DELETE /auth/cleanup` é público e destrutivo** (`cleanup-expired-tokens.ts`). Não
  tem autenticação desde antes desta branch e não é chamado por nada neste repo — a
  renovação automática roda in-process via `startAutoRefreshService`.
- **`GET /user/find/all` não tem escopo de dados**: devolve nome, email e núcleo de
  todos os usuários para qualquer um com acesso liberado, incluindo cargo LOCAL.
  Definir a regra de visibilidade por cargo/região exige decisão de produto.
- `callback.ts` grava `usuarioId: ""` quando o `state` não decodifica, e loga tokens do
  Google com `console.log`.
- `error-handler.ts:17` faz `console.log` de todo erro, incluindo 400 de validação.
- `requirePermission` continua sem uso. Ligá-lo de verdade daria a granularidade que o
  código sempre prometeu, mas exige mapear a permissão de cada rota — e cuidado: o
  escopo LOCAL concede zero permissões, então o cargo 56 perderia acesso a tudo se o
  mapeamento for feito sem pensar nesse caso.
- Os dois novos testes que montam o app real disparam `startAutoRefreshService()` via
  `oauth-route.ts`, criando um `setInterval` de 5 minutos que `app.close()` não limpa.
  Hoje só gera ruído; pode virar teste pendurado.
- `sign-up-service.ts` não zera `senha` no ramo `update` do upsert. O campo é morto
  (login é 100% Cognito, bcrypt não é usado em lugar nenhum), mas a linha troca de dono.
