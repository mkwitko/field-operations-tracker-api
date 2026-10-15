import { prisma } from "prisma/db";
import { ForbiddenError } from "@/errors/forbidden-error";
import { PERMISSIONS } from "@/permissions";

interface ResolveViewScopeParams {
  userId: string;
  generalView?: string;
  regionView?: string;
  nucleoView?: string;
}

/**
 * Valida o escopo de visualização pedido (general/region/nucleo) contra as
 * permissões e a própria região/núcleo do usuário. Lança ForbiddenError se não
 * for permitido. Retorna o núcleo do usuário para o branch padrão (só o seu).
 *
 * Níveis:
 *  - VER_REGIOES         → tudo (general, qualquer região, qualquer núcleo)
 *  - VER_PROPRIA_REGIAO  → só a própria região (e núcleos dentro dela)
 *  - VER_NUCLEOS         → qualquer núcleo (legado)
 *  - (baseline)          → só o próprio núcleo
 */
export async function resolveViewScope({
  userId,
  generalView,
  regionView,
  nucleoView,
}: ResolveViewScopeParams): Promise<{
  ownNucleoId: string | null;
  ownRegiaoId: string | null;
}> {
  const user = await prisma.usuarios.findUnique({
    where: { id: userId },
    select: {
      nucleoId: true,
      nucleo: { select: { regioesId: true } },
      permissoes: { select: { name: true } },
    },
  });

  const perms = user?.permissoes.map((p) => p.name) ?? [];
  const ownNucleoId = user?.nucleoId ?? null;
  const ownRegiaoId = user?.nucleo?.regioesId ?? null;

  const verTudo = perms.includes(PERMISSIONS.VER_REGIOES);
  const verNucleos = perms.includes(PERMISSIONS.VER_NUCLEOS);
  const verPropriaRegiao = perms.includes(PERMISSIONS.VER_PROPRIA_REGIAO);

  // generalView (todas as regiões) → só quem vê tudo
  if (generalView && !verTudo) {
    throw new ForbiddenError();
  }

  // regionView → tudo (qualquer) ou própria região (só a sua)
  if (regionView) {
    const canOwn =
      verPropriaRegiao && !!ownRegiaoId && regionView === ownRegiaoId;
    if (!verTudo && !canOwn) throw new ForbiddenError();
  }

  // nucleoView diferente do próprio núcleo
  if (nucleoView && nucleoView !== ownNucleoId) {
    let allowed = verTudo || verNucleos;
    if (!allowed && verPropriaRegiao && ownRegiaoId) {
      const nuc = await prisma.nucleos.findUnique({
        where: { id: nucleoView },
        select: { regioesId: true },
      });
      allowed = !!nuc && nuc.regioesId === ownRegiaoId;
    }
    if (!allowed) throw new ForbiddenError();
  }

  return { ownNucleoId, ownRegiaoId };
}
