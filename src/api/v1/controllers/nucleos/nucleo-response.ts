import z from "zod";

/** Schema de resposta de núcleo (listagem/leitura). */
export const nucleosResponse = z.object({
  id: z.string(),
  nome: z.string(),
  regioes: z
    .object({
      id: z.string(),
      nome: z.string(),
    })
    .nullable(),
});
