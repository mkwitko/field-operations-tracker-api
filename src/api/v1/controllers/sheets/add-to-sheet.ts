import { googleSheetsAuthMiddleware } from "@/middlewares/google-oauth-middleware";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import z from "zod";

export const AddDataToSheetInputSchema = z.object({
  spreadsheetTitle: z.string().min(1, "O título da planilha é obrigatório"),
  sheetName: z.string().min(1, "O nome da aba é obrigatório"),
  values: z
    .array(z.array(z.string().nullable().optional()))
    .min(1, "Dados obrigatórios"),
  merges: z
    .array(
      z.object({
        startRow: z.number(),
        endRow: z.number(),
        startColumn: z.number(),
        endColumn: z.number(),
      })
    )
    .optional(),
  insertAtTop: z.boolean().optional().default(false),
  skipRows: z.number().optional().default(1),
});

export const AddDataToSheetResponseSchema = z.object({
  updatedRange: z.string(),
  spreadsheetId: z.string(),
  spreadsheetUrl: z.string().url(),
});

export async function addDataToSheet(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .post(
      "/sheets/add",
      {
        preHandler: [googleSheetsAuthMiddleware],
        schema: {
          tags: ["Sheets"],
          summary: "Adiciona dados a uma aba existente em uma planilha Google",
          description:
            "Insere linhas no final (ou início) de uma aba específica sem sobrescrever o conteúdo existente.",
          operationId: "addDataToSheet",
          body: AddDataToSheetInputSchema,
          response: {
            201: AddDataToSheetResponseSchema,
            500: z.object({
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const accessToken = request.googleToken as string;
        const { spreadsheetTitle, sheetName, values, insertAtTop, skipRows } =
          request.body;

        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });

          const drive = google.drive({ version: "v3", auth: oauth2Client });
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });

          // 1️⃣ Encontrar planilha pelo título
          const existingFiles = await drive.files.list({
            q: `name='${spreadsheetTitle}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: "files(id, name, webViewLink)",
            pageSize: 1,
          });

          if (!existingFiles.data.files?.length) {
            return reply.status(404).send({
              error: "Planilha não encontrada",
              message: `Nenhuma planilha chamada '${spreadsheetTitle}' foi encontrada.`,
            });
          }

          const spreadsheet = existingFiles.data.files[0];
          const spreadsheetId = spreadsheet.id!;
          const spreadsheetUrl = spreadsheet.webViewLink!;

          // 2️⃣ Verificar se a aba existe
          const sheetInfo = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "sheets.properties.title",
          });

          const existingSheetNames =
            sheetInfo.data.sheets?.map((s) => s.properties?.title) || [];

          if (!existingSheetNames.includes(sheetName)) {
            return reply.status(404).send({
              error: "Aba não encontrada",
              message: `A aba '${sheetName}' não existe na planilha '${spreadsheetTitle}'.`,
            });
          }

          // 3️⃣ Inserir dados (no final ou no topo)
          if (insertAtTop) {
            const currentValues = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: sheetName,
            });

            const existingData = currentValues.data.values || [];

            const skip = skipRows ?? 1;
            const preservedRows = existingData.slice(0, skip);
            const dataWithoutPreserved = existingData.slice(skip);

            const newData = [...preservedRows, ...values, ...dataWithoutPreserved];

            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A1`,
              valueInputOption: "RAW",
              requestBody: { values: newData },
            });
          } else {
            await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: sheetName,
              valueInputOption: "RAW",
              insertDataOption: "INSERT_ROWS",
              requestBody: { values },
            });
          }

          // 4️⃣ Aplicar merges se houver
          if (request.body.merges?.length) {
            const spreadsheet = await sheets.spreadsheets.get({
              spreadsheetId,
              fields: "sheets.properties",
            });

            const sheet = spreadsheet.data.sheets?.find(
              (s) => s.properties?.title === sheetName
            );

            const sheetId = sheet?.properties?.sheetId;
            if (sheetId) {
              const mergeRequests = request.body.merges.map((m) => ({
                mergeCells: {
                  range: {
                    sheetId,
                    startRowIndex: m.startRow,
                    endRowIndex: m.endRow + 1,
                    startColumnIndex: m.startColumn,
                    endColumnIndex: m.endColumn + 1,
                  },
                  mergeType: "MERGE_ALL",
                },
              }));

              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: { requests: mergeRequests },
              });
            }
          }

          return reply.status(201).send({
            updatedRange: `${sheetName}!A1`,
            spreadsheetId,
            spreadsheetUrl,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({
            error: "Falha ao adicionar dados à planilha",
            message:
              error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
    );
}
