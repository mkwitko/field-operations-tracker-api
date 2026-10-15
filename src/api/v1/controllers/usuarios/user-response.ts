import z from "zod";

/** Schema de resposta de usuário (find-me, find-users, find-user-by-id). */
export const userResponse = z.object({
  id: z.string(),
  nome: z.string(),
  email: z.string().nullable(),
  // Provisionado do Cognito
  grau: z.string().nullable(),
  bypass: z.boolean(),
  // Recalculado no /me: false = entrou mas não tem cargo com acesso.
  acessoLiberado: z.boolean(),
  cargoNome: z.string().nullable(),
  cargoCodigo: z.string().nullable(),
  // Integrações é opcional por usuário.
  integracoesAtivo: z.boolean(),
  // custom:cargos armazenado cru (string) → exposto como array de códigos/nomes
  cargos: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : (v ?? []),
    z.array(z.string()),
  ),
  permissoes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  nucleo: z
    .object({
      id: z.string(),
      nome: z.string(),
      // Controle de estoque opcional por núcleo.
      estoqueAtivo: z.boolean(),
      regioes: z
        .object({
          id: z.string(),
          nome: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});
