import { prisma } from "prisma/db";
import { ForbiddenError } from "@/errors/forbidden-error";

/**
 * Escrita (criar/editar/excluir) só é permitida no próprio núcleo do usuário.
 * Acessos GLOBAL/REGIONAL servem apenas para VER e EXPORTAR.
 */

/** Núcleo do usuário logado (ou null). */
export async function getOwnNucleoId(userId: string): Promise<string | null> {
  const user = await prisma.usuarios.findUnique({
    where: { id: userId },
    select: { nucleoId: true },
  });
  return user?.nucleoId ?? null;
}

/** Núcleo do usuário; erro se não tiver (não pode criar/editar sem núcleo). */
export async function requireOwnNucleoId(userId: string): Promise<string> {
  const nucleoId = await getOwnNucleoId(userId);
  if (!nucleoId) {
    throw new ForbiddenError(
      "Usuário sem núcleo — não é possível criar ou editar registros",
    );
  }
  return nucleoId;
}

/**
 * Garante que o registro alvo pertence ao núcleo do próprio usuário.
 * Retorna o núcleo do usuário (para reusar na escrita).
 */
export async function assertOwnNucleo(
  userId: string,
  targetNucleoId: string | null | undefined,
): Promise<string> {
  const own = await requireOwnNucleoId(userId);
  if (targetNucleoId !== own) {
    throw new ForbiddenError(
      "Só é possível alterar registros do seu próprio núcleo",
    );
  }
  return own;
}
