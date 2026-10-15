/**
 * Fonte única dos nomes de permissão (coincide com Permissoes.name no banco).
 * Usado pelo middleware de permissão, gating de escopo e seed.
 */
export const PERMISSIONS = {
  CRIAR_USUARIOS: "CRIAR_USUARIOS",
  CRIAR_NUCLEOS: "CRIAR_NUCLEOS",
  CRIAR_REGIOES: "CRIAR_REGIOES",
  VER_NUCLEOS: "VER_NUCLEOS",
  VER_REGIOES: "VER_REGIOES",
  VER_PROPRIA_REGIAO: "VER_PROPRIA_REGIAO",
  EXPORTAR_NUCLEOS: "EXPORTAR_NUCLEOS",
  EXPORTAR_REGIOES: "EXPORTAR_REGIOES",
  EXPORTAR_PROPRIA_REGIAO: "EXPORTAR_PROPRIA_REGIAO",
  ADMINISTRADOR: "ADMINISTRADOR",
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: { name: PermissionName; description: string }[] = [
  { name: PERMISSIONS.CRIAR_USUARIOS, description: "Criar, editar e excluir usuários" },
  { name: PERMISSIONS.CRIAR_NUCLEOS, description: "Criar, editar e excluir núcleos" },
  { name: PERMISSIONS.CRIAR_REGIOES, description: "Criar, editar e excluir regiões" },
  { name: PERMISSIONS.VER_NUCLEOS, description: "Ver dados de qualquer núcleo" },
  { name: PERMISSIONS.VER_REGIOES, description: "Ver dados por região e geral" },
  { name: PERMISSIONS.VER_PROPRIA_REGIAO, description: "Ver dados apenas da própria região" },
  { name: PERMISSIONS.EXPORTAR_NUCLEOS, description: "Exportar dados de qualquer núcleo" },
  { name: PERMISSIONS.EXPORTAR_REGIOES, description: "Exportar dados por região e geral" },
  { name: PERMISSIONS.EXPORTAR_PROPRIA_REGIAO, description: "Exportar dados apenas da própria região" },
  { name: PERMISSIONS.ADMINISTRADOR, description: "Acesso total ao sistema" },
];

// Grupos de hierarquia — qualquer um dos nomes satisfaz o escopo.
export const VIEW_NUCLEO_SCOPE = [PERMISSIONS.VER_NUCLEOS, PERMISSIONS.VER_REGIOES];
export const VIEW_REGION_SCOPE = [PERMISSIONS.VER_REGIOES];
export const EXPORT_NUCLEO_SCOPE = [
  PERMISSIONS.EXPORTAR_NUCLEOS,
  PERMISSIONS.EXPORTAR_REGIOES,
];
export const EXPORT_REGION_SCOPE = [PERMISSIONS.EXPORTAR_REGIOES];

/** true se `names` contém ADMINISTRADOR ou qualquer uma de `required`. */
export function hasAnyPermission(
  names: string[],
  required: readonly string[],
): boolean {
  if (names.includes(PERMISSIONS.ADMINISTRADOR)) return true;
  return required.some((r) => names.includes(r));
}
