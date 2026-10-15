import { prisma } from "prisma/db";

/** Retorna os nomes de permissão de um usuário. */
export async function getUserPermissionNames(userId: string): Promise<string[]> {
  const user = await prisma.usuarios.findUnique({
    where: { id: userId },
    select: { permissoes: { select: { name: true } } },
  });
  return user?.permissoes.map((p) => p.name) ?? [];
}
