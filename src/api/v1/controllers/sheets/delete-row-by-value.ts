import { googleSheetsAuthMiddleware } from "@/middlewares/google-oauth-middleware";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import z from "zod";

export const DeleteRowByValueInputSchema = z.object({
  spreadsheetTitle: z.string().min(1, "O título da planilha é obrigatório"),
  sheetName: z.string().min(1, "O nome da aba é obrigatório"),
  searchColumn: z.string().optional().default("A"),
  matchValue: z.string().min(1, "O valor a ser buscado é obrigatório"),
});

export const DeleteRowByValueResponseSchema = z.object({
  message: z.string(),
  deletedRow: z.number(),
  spreadsheetId: z.string(),
  spreadsheetUrl: z.string().url(),
});

export async function deleteRowByValueRoute(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .delete(
      "/sheets/delete-row-by-value",
      {
        preHandler: [googleSheetsAuthMiddleware],
        schema: {
          tags: ["Sheets"],
          summary: "Deleta uma linha da planilha com base no valor de uma célula",
          description:
            "Busca um valor em uma coluna específica e remove a linha correspondente.",
          operationId: "deleteRowByValue",
          body: DeleteRowByValueInputSchema,
          response: {
            200: DeleteRowByValueResponseSchema,
            404: z.object({
              error: z.string(),
              message: z.string(),
            }),
            500: z.object({
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const accessToken = request.googleToken as string;
        const { spreadsheetTitle, sheetName, searchColumn, matchValue } =
          request.body;

        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });

          const drive = google.drive({ version: "v3", auth: oauth2Client });
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });

          // 1️⃣ Procurar planilha pelo título
          let existingFiles: any;
          try {
            existingFiles = await drive.files.list({
              q: `name='${spreadsheetTitle}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
              fields: "files(id, name, webViewLink)",
              pageSize: 1,
            });
          } catch (err) {
            return reply.status(500).send({
              error: "Falha ao acessar o Google Drive",
              message:
                "Não foi possível buscar a planilha. Verifique sua conexão ou autenticação com o Google.",
            });
          }

          if (!existingFiles.data.files?.length) {
            return reply.status(404).send({
              error: "Planilha não encontrada",
              message: `Nenhuma planilha chamada '${spreadsheetTitle}' foi encontrada.`,
            });
          }

          const spreadsheet = existingFiles.data.files[0];
          const spreadsheetId = spreadsheet.id!;
          const spreadsheetUrl = spreadsheet.webViewLink!;

          // 2️⃣ Tentar obter metadados da planilha
          let spreadsheetData: any;
          try {
            spreadsheetData = await sheets.spreadsheets.get({
              spreadsheetId,
              fields: "sheets(properties(sheetId,title))",
            });
          } catch (err: any) {
            if (err.code === 404) {
              return reply.status(404).send({
                error: "Planilha inacessível",
                message: `A planilha '${spreadsheetTitle}' não pôde ser acessada. Verifique se você tem permissão.`,
              });
            }
            throw err;
          }

          const sheet = spreadsheetData.data.sheets?.find(
            (s: any) => s.properties?.title === sheetName
          );

          if (!sheet || !sheet.properties?.sheetId) {
            return reply.status(404).send({
              error: "Aba não encontrada",
              message: `A aba '${sheetName}' não existe na planilha '${spreadsheetTitle}'.`,
            });
          }

          const sheetId = sheet.properties.sheetId;

          // 3️⃣ Ler valores da coluna
          const range = `${sheetName}!${searchColumn}:${searchColumn}`;
          const valuesResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
          });

          const rows = valuesResponse.data.values || [];

          // 4️⃣ Procurar valor
          const rowIndex = rows.findIndex(
            (row) => row[0]?.toString().trim() === matchValue.trim()
          );

          if (rowIndex === -1) {
            return reply.status(404).send({
              error: "Valor não encontrado",
              message: `Nenhuma célula na coluna '${searchColumn}' contém o valor '${matchValue}'.`,
            });
          }

          // 5️⃣ Deletar linha
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId,
                      dimension: "ROWS",
                      startIndex: rowIndex,
                      endIndex: rowIndex + 1,
                    },
                  },
                },
              ],
            },
          });

          return reply.status(200).send({
            message: `Linha ${rowIndex + 1} (valor: '${matchValue}') deletada com sucesso da coluna ${searchColumn}.`,
            deletedRow: rowIndex + 1,
            spreadsheetId,
            spreadsheetUrl,
          });
        } catch (error: any) {
          request.log.error(error);

          // Tratamento refinado para erros de API Google
          if (error.code === 403) {
            return reply.status(403).send({
              error: "Acesso negado",
              message:
                "Você não tem permissão para acessar ou modificar essa planilha.",
            });
          }

          if (error.code === 404) {
            return reply.status(404).send({
              error: "Planilha não encontrada",
              message:
                "A planilha pode ter sido excluída, movida ou estar inacessível.",
            });
          }

          return reply.status(500).send({
            error: "Falha ao deletar linha da planilha",
            message:
              error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
    );
}
