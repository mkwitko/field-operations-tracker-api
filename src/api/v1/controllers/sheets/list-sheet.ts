import { googleSheetsAuthMiddleware } from "@/middlewares/google-oauth-middleware";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import z from "zod";

export const ListSheetsQuerySchema = z.object({
  pageSize: z.coerce.number().min(1).max(100).default(10),
  pageToken: z.string().optional(),
});

export const ListSheetsResponseSchema = z.object({
  sheets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mimeType: z.string(),
      createdTime: z.string(),
      modifiedTime: z.string(),
      webViewLink: z.string().optional().nullable(),
    })
  ),
  nextPageToken: z.string().optional().nullable(),
});

export async function listSheets(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/sheets",
      {
        preHandler: [googleSheetsAuthMiddleware],
        schema: {
          tags: ["Sheets"],
          summary: "List User Sheets",
          description: "Lista todas as planilhas do usuário",
          operationId: "listUserSheets",
          querystring: ListSheetsQuerySchema,
          response: {
            200: ListSheetsResponseSchema,
            500: z.object({
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const accessToken = request.googleToken as string;
        const { pageSize, pageToken } = request.query;

        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });

          const drive = google.drive({ version: "v3", auth: oauth2Client });

          const response = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
            pageSize,
            pageToken,
            fields:
              "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, webViewLink)",
            orderBy: "modifiedTime desc",
          });

          const sheets = response.data.files?.map((file) => ({
            id: file.id!,
            name: file.name!,
            mimeType: file.mimeType!,
            createdTime: file.createdTime!,
            modifiedTime: file.modifiedTime!,
            webViewLink: file.webViewLink,
          })) || [];

          return reply.status(200).send({
            sheets,
            nextPageToken: response.data.nextPageToken,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({
            error: "Falha ao listar planilhas",
            message: error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
    );
}