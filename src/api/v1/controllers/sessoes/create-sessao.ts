import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'
import { SessoesModel } from '../../models/sessoes-model'
import { requireOwnNucleoId } from '../../services/authorization/assert-own-nucleo'

const sessoesModel = new SessoesModel()

export const localVegetalEnum = z.enum(['estoque', 'geladeira'])

export const consumoVegetalSchema = z.object({
  vegetalId: z.string(),
  // Litros consumidos na sessão.
  quantidade: z.string(),
  local: localVegetalEnum,
  // Litros filtrados (retirados do estoque). Se ausente, usa `quantidade` (legado).
  filtrado: z.string().optional(),
})

export const SessoesCreateInputSchema = z.object({
  sessao: z.string(),
  pessoas: z.string(),
  data: z.string(),
  descricao: z.string().optional(),
  // Total consumido. Opcional quando `vegetais` é enviado (calculado a partir dele).
  quantidadeVegetal: z.string().optional(),
  nucleosId: z.string().optional(),
  // Uma sessão pode consumir vários vegetais, cada um do estoque ou da geladeira.
  vegetais: z.array(consumoVegetalSchema).optional(),
  // Se true, desconta o filtrado do estoque. Default true (compat).
  descontarEstoque: z.boolean().optional(),
  // Se true, soma a diferença (filtrado - consumido) na geladeira. Só aplica com desconto.
  adicionarGeladeira: z.boolean().optional(),
})

export const consumoVegetalResponse = z.object({
  id: z.string(),
  quantidade: z.string(),
  filtrado: z.string(),
  local: z.string(),
  vegetalId: z.string(),
  vegetal: z
    .object({
      id: z.string(),
      nome: z.string(),
      tipo: z.string(),
    })
    .nullable()
    .optional(),
})

export const sessoesResponse = z.object({
  id: z.string(),
  sessao: z.string(),
  descricao: z.string().nullable().optional(),
  data: z.string(),
  pessoas: z.string(),
  quantidadeVegetal: z.string(),
  nucleosId: z.string().nullable().optional(),
  Nucleos: z.object({
    nome: z.string(),
    regioes: z.object({
      nome: z.string(),
    }).nullable()
  }).nullable(),
  vegetais: z.array(consumoVegetalResponse).optional(),
})

export async function createSessaoRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/sessao/create',
    {
      schema: {
        tags: ['Sessoes'],
        summary: 'Create Sessao',
        body: SessoesCreateInputSchema,
        response: {
          201: sessoesResponse,
          // `errors` só existe quando o 400 vem de falha de validação do zod;
          // sem o campo aqui, a serialização descartaria o que o
          // error-handler manda. Por isso é opcional.
          400: z.object({
            message: z.string(),
            errors: z.record(z.array(z.string())).optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Escrita só no próprio núcleo — ignora nucleosId do body.
      const nucleosId = await requireOwnNucleoId(request.user.userId)
      const body = request.body
      if (!body.vegetais?.length && !body.quantidadeVegetal) {
        return reply
          .status(400)
          .send({ message: 'Informe a quantidade de vegetal ou os vegetais consumidos' })
      }
      const sessao = await sessoesModel.create({ ...body, nucleosId })
      return reply.status(201).send(sessao)
    },
  )
}
