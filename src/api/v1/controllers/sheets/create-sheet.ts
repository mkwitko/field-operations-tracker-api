import { googleSheetsAuthMiddleware } from "@/middlewares/google-oauth-middleware";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import z from "zod";

// Schema para merge de células
const MergeSchema = z.object({
  startRow: z.number(),
  endRow: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
});

// Schema para formatação de células
const FormatRequestSchema = z
  .object({
    repeatCell: z
      .object({
        range: z.object({
          sheetId: z.number(),
          startRowIndex: z.number(),
          endRowIndex: z.number(),
          startColumnIndex: z.number(),
          endColumnIndex: z.number(),
        }),
        cell: z.object({
          userEnteredFormat: z.object({
            backgroundColor: z
              .object({
                red: z.number(),
                green: z.number(),
                blue: z.number(),
              })
              .optional(),
            textFormat: z
              .object({
                bold: z.boolean().optional(),
                fontSize: z.number().optional(),
                foregroundColor: z
                  .object({
                    red: z.number(),
                    green: z.number(),
                    blue: z.number(),
                  })
                  .optional(),
              })
              .optional(),
            horizontalAlignment: z.string().optional(),
            verticalAlignment: z.string().optional(),
            wrapStrategy: z.string().optional(),
          }),
        }),
        fields: z.string(),
      })
      .optional(),
    updateBorders: z
      .object({
        range: z.object({
          sheetId: z.number(),
          startRowIndex: z.number(),
          endRowIndex: z.number(),
          startColumnIndex: z.number(),
          endColumnIndex: z.number(),
        }),
        top: z.any().optional(),
        bottom: z.any().optional(),
        left: z.any().optional(),
        right: z.any().optional(),
        innerHorizontal: z.any().optional(),
        innerVertical: z.any().optional(),
      })
      .optional(),
    updateDimensionProperties: z
      .object({
        range: z.object({
          sheetId: z.number(),
          dimension: z.string(),
          startIndex: z.number(),
          endIndex: z.number(),
        }),
        properties: z.object({
          pixelSize: z.number(),
        }),
        fields: z.string(),
      })
      .optional(),
  })
  .passthrough();

export const CreateMultiSheetInputSchema = z.object({
  title: z.string().min(1, "O título é obrigatório"),
  sessoes: z.array(z.array(z.string().nullable().optional())).optional(),
  preparos: z.array(z.array(z.string().nullable().optional())).optional(),
  preparosMerges: z.array(MergeSchema).optional(),
  preparosFormatting: z.array(FormatRequestSchema).optional(),
  resultados: z.array(z.array(z.string().nullable().optional())).optional(),
  resultadosMerges: z.array(MergeSchema).optional(),
  resultadosFormatting: z.array(FormatRequestSchema).optional(),
  vegetal: z.array(z.array(z.string().nullable().optional())).optional(),
  vegetalMerges: z.array(MergeSchema).optional(),
  vegetalFormatting: z.array(FormatRequestSchema).optional(),
});

export const CreateSheetResponseSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
});

export async function createSheet(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .post(
      "/sheets/create",
      {
        preHandler: [googleSheetsAuthMiddleware],
        schema: {
          tags: ["Sheets"],
          summary: "Create or overwrite Google Sheet for User",
          description:
            "Cria uma planilha na conta Google do usuário com as abas: Sessões, Preparos, Resultados e Estoque de Vegetal. Se já existir, substitui os dados.",
          operationId: "createOrUpdateMultiSheet",
          body: CreateMultiSheetInputSchema,
          response: {
            201: CreateSheetResponseSchema,
            500: z.object({
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const accessToken = request.googleToken as string;
        const {
          title,
          sessoes,
          preparos,
          preparosMerges,
          preparosFormatting,
          resultados,
          resultadosMerges,
          resultadosFormatting,
          vegetal,
          vegetalMerges,
          vegetalFormatting,
        } = request.body;

        const sheetNames = [
          "Sessões",
          "Preparos",
          "Resultados",
          "Estoque de Vegetal",
        ];
        const dataMap: Record<string, any[][] | undefined> = {
          Sessões: sessoes,
          Preparos: preparos,
          Resultados: resultados,
          "Estoque de Vegetal": vegetal,
        };
        const mergeMap: Record<string, typeof preparosMerges> = {
          Preparos: preparosMerges,
          Resultados: resultadosMerges,
          "Estoque de Vegetal": vegetalMerges,
        };
        const formattingMap: Record<string, typeof preparosFormatting> = {
          Preparos: preparosFormatting,
          Resultados: resultadosFormatting,
          "Estoque de Vegetal": vegetalFormatting,
        };

        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });

          const drive = google.drive({ version: "v3", auth: oauth2Client });
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });

          // 1️⃣ Check if spreadsheet exists
          const existingFiles = await drive.files.list({
            q: `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: "files(id, name, webViewLink)",
            pageSize: 1,
          });

          let spreadsheetId: string;
          let spreadsheetUrl: string;

          if (existingFiles.data.files?.length) {
            // Spreadsheet exists
            const existingFile = existingFiles.data.files[0];
            spreadsheetId = existingFile.id!;
            spreadsheetUrl = existingFile.webViewLink!;
          } else {
            // Spreadsheet does not exist — create it with all sheets
            const response = await sheets.spreadsheets.create({
              requestBody: {
                properties: { title },
                sheets: sheetNames.map((name) => ({
                  properties: { title: name },
                })),
              },
            });

            spreadsheetId = response.data.spreadsheetId!;
            spreadsheetUrl = response.data.spreadsheetUrl!;
          }

          // 2️⃣ For each sheet, create if missing and update values
          const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "sheets(properties(title,sheetId))",
          });

          const existingSheetTitles =
            spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];
          const sheetIdMap: Record<string, number> = {};

          if (spreadsheet.data.sheets) {
            for (const s of spreadsheet.data.sheets) {
              if (
                s.properties?.title &&
                s.properties?.sheetId !== undefined &&
                s.properties?.sheetId !== null
              ) {
                sheetIdMap[s.properties.title] = s.properties.sheetId;
              }
            }
          }

          for (const sheetName of sheetNames) {
            const sheetData = dataMap[sheetName];
            if (!sheetData) continue; // skip if no data provided

            if (!existingSheetTitles.includes(sheetName)) {
              // Create the sheet if it doesn't exist
              const addSheetResponse = await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                  requests: [
                    { addSheet: { properties: { title: sheetName } } },
                  ],
                },
              });

              // Get the newly created sheet ID
              const newSheetId =
                addSheetResponse.data.replies?.[0]?.addSheet?.properties
                  ?.sheetId;
              if (typeof newSheetId === "number") {
                sheetIdMap[sheetName] = newSheetId;
              }
            }

            // Clear existing values
            await sheets.spreadsheets.values.clear({
              spreadsheetId,
              range: `${sheetName}`,
            });

            // Update with new data
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A1`,
              valueInputOption: "RAW",
              requestBody: { values: sheetData },
            });

            // 3️⃣ Apply merges and formatting if provided
            const merges = mergeMap[sheetName];
            const formatting = formattingMap[sheetName];

            if (
              (merges && merges.length > 0) ||
              (formatting && formatting.length > 0)
            ) {
              if (sheetIdMap[sheetName] === undefined) continue;

              const sheetId = sheetIdMap[sheetName];
              const batchRequests: any[] = [];

              // Primeiro: desmezclar tudo
              batchRequests.push({
                unmergeCells: {
                  range: {
                    sheetId: sheetId,
                  },
                },
              });

              // Segundo: aplicar novos merges
              if (merges && merges.length > 0) {
                const mergeRequests = merges.map((merge) => ({
                  mergeCells: {
                    range: {
                      sheetId: sheetId,
                      startRowIndex: merge.startRow,
                      endRowIndex: merge.endRow + 1,
                      startColumnIndex: merge.startColumn,
                      endColumnIndex: merge.endColumn + 1,
                    },
                    mergeType: "MERGE_ALL",
                  },
                }));
                batchRequests.push(...mergeRequests);
              }

              // Executar merges
              if (batchRequests.length > 1) {
                // Mais que apenas o unmergeCells
                await sheets.spreadsheets.batchUpdate({
                  spreadsheetId,
                  requestBody: {
                    requests: batchRequests,
                  },
                });
              }

              // 4️⃣ Aplicar formatação customizada
              if (formatting && formatting.length > 0) {
                // Substituir sheetId placeholder por sheetId real
                const formattingWithSheetId = formatting.map((req) => {
                  const newReq = JSON.parse(JSON.stringify(req));

                  // Atualizar sheetId em todos os lugares possíveis
                  if (newReq.repeatCell?.range) {
                    newReq.repeatCell.range.sheetId = sheetId;
                  }
                  if (newReq.updateBorders?.range) {
                    newReq.updateBorders.range.sheetId = sheetId;
                  }
                  if (newReq.updateDimensionProperties?.range) {
                    newReq.updateDimensionProperties.range.sheetId = sheetId;
                  }

                  return newReq;
                });

                await sheets.spreadsheets.batchUpdate({
                  spreadsheetId,
                  requestBody: {
                    requests: formattingWithSheetId,
                  },
                });
              }
            }
          }

          return reply
            .status(201)
            .send({ id: spreadsheetId, url: spreadsheetUrl, title });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({
            error: "Falha ao criar ou atualizar planilha",
            message:
              error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
    );
}
