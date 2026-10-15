import { addDataToSheet } from '@/api/v1/controllers/sheets/add-to-sheet'
import { createSheet } from '@/api/v1/controllers/sheets/create-sheet'
import { deleteRowByValueRoute } from '@/api/v1/controllers/sheets/delete-row-by-value'
import { deleteSheet } from '@/api/v1/controllers/sheets/delete-sheet'
import { listSheets } from '@/api/v1/controllers/sheets/list-sheet'
import { requireAcessoLiberado } from '@/middlewares/acesso-liberado-middleware'
import { authenticationMiddleware } from '@/middlewares/authentication-middleware'
import type { FastifyInstance } from 'fastify'

export async function sheetsRoute(app: FastifyInstance) {
  // Todas as rotas de planilha criam/apagam dados no Google Sheets do núcleo,
  // então exigem acesso ao aplicativo — não basta estar autenticado. O
  // authenticationMiddleware vive aqui (e não em cada controller) porque o gate
  // precisa rodar depois dele e antes do handler.
  app.register(async (scoped) => {
    scoped.register(authenticationMiddleware)
    scoped.register(requireAcessoLiberado)

    scoped.register(createSheet)
    scoped.register(listSheets)
    scoped.register(addDataToSheet)
    scoped.register(deleteRowByValueRoute)
    scoped.register(deleteSheet)
  })
}
