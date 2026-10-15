import { googleSheetsAuthMiddleware } from "@/middlewares/google-oauth-middleware";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { google } from "googleapis";
import z from "zod";

export const DeleteSheetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  deletedId: z.string().optional(),
});

export const DeleteSheetParamsSchema = z.object({
  title: z.string().min(1, "O título da planilha é obrigatório"),
});

export async function deleteSheet(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .delete(
      "/sheets/:title",
      {
        preHandler: [googleSheetsAuthMiddleware],
        schema: {
          tags: ["Sheets"],
          summary: "Delete Google Sheet by title",
          description:
            "Exclui uma planilha do Google Drive com base no nome informado.",
          operationId: "deleteSheetByTitle",
          params: DeleteSheetParamsSchema,
          response: {
            200: DeleteSheetResponseSchema,
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
        const { title } = request.params;

        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });

          const drive = google.drive({ version: "v3", auth: oauth2Client });

          // 1️⃣ Procurar arquivo com esse título
          const existingFiles = await drive.files.list({
            q: `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: "files(id, name)",
            pageSize: 1,
          });

          if (!existingFiles.data.files?.length) {
            return reply.status(404).send({
              error: "Not Found",
              message: `Nenhuma planilha encontrada com o título "${title}"`,
            });
          }

          const fileId = existingFiles.data.files[0].id!;

          // 2️⃣ Deletar arquivo do Drive
          await drive.files.delete({ fileId });

          return reply.status(200).send({
            success: true,
            message: `Planilha "${title}" excluída com sucesso.`,
            deletedId: fileId,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({
            error: "Falha ao excluir planilha",
            message:
              error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
    );
}
