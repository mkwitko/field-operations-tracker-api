/**
 * Backfill único: para linhas de consumo antigas (criadas antes do campo `filtrado`),
 * o valor descontado do estoque era a própria `quantidade`. Copia quantidade -> filtrado
 * onde filtrado ainda é "0", para que reversões (editar/excluir sessão) fiquem corretas.
 *
 * Rodar UMA vez, logo após aplicar a migração e ANTES de criar novas sessões:
 *   npx tsx prisma/backfill-filtrado.mts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const legacy = await prisma.sessaoVegetal.findMany({
    where: { filtrado: "0" },
    select: { id: true, quantidade: true },
  });

  console.log(`Backfill: ${legacy.length} linha(s) a atualizar...`);

  for (const row of legacy) {
    await prisma.sessaoVegetal.update({
      where: { id: row.id },
      data: { filtrado: row.quantidade, descontouEstoque: true },
    });
  }

  console.log("Backfill concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
