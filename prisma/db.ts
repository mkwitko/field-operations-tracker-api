import { PrismaError } from "@/errors/prisma-error";
import { handlePrismaError } from "@/errors/prisma/prisma-error-handler";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        try {
          // Executa a query de fato
          const result = await query(args);
          return result;
        } catch (error: any) {
          const errorMessage = handlePrismaError(error);
          throw new PrismaError(errorMessage);
        }
      },
    },
  },
});
