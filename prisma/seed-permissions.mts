import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Coincide com src/permissions.ts (inline p/ evitar resolução de alias no tsx).
const PERMISSIONS = [
  { name: "CRIAR_USUARIOS", description: "Criar, editar e excluir usuários" },
  { name: "CRIAR_NUCLEOS", description: "Criar, editar e excluir núcleos" },
  { name: "CRIAR_REGIOES", description: "Criar, editar e excluir regiões" },
  { name: "VER_NUCLEOS", description: "Ver dados de qualquer núcleo" },
  { name: "VER_REGIOES", description: "Ver dados por região e geral" },
  { name: "VER_PROPRIA_REGIAO", description: "Ver dados apenas da própria região" },
  { name: "EXPORTAR_NUCLEOS", description: "Exportar dados de qualquer núcleo" },
  { name: "EXPORTAR_REGIOES", description: "Exportar dados por região e geral" },
  { name: "EXPORTAR_PROPRIA_REGIAO", description: "Exportar dados apenas da própria região" },
  { name: "ADMINISTRADOR", description: "Acesso total ao sistema" },
];

async function main() {
  console.log("🔐 Semeando permissões...");
  for (const perm of PERMISSIONS) {
    await prisma.permissoes.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`✅ ${PERMISSIONS.length} permissões garantidas.`);

  // Bootstrap: promove um usuário a ADMINISTRADOR via ADMIN_EMAIL (opcional).
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const user = await prisma.usuarios.findUnique({
      where: { email: adminEmail },
    });
    if (user) {
      await prisma.usuarios.update({
        where: { id: user.id },
        data: { permissoes: { connect: { name: "ADMINISTRADOR" } } },
      });
      console.log(`👑 ${adminEmail} promovido a ADMINISTRADOR.`);
    } else {
      console.warn(`⚠️  ADMIN_EMAIL "${adminEmail}" não encontrado.`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
