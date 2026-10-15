import { prisma } from "prisma/db";
import type { PermissionName } from "@/permissions";

interface CognitoUserData {
  email: string;
  nome: string;
  grau: string | null;
  cargos: string | null;
  cargoNome: string | null;
  cargoCodigo: string | null;
}

export class UsuariosModel {
  // Busca usuário por ID (sem senha), com núcleo/região e permissões.
  async findById(id: string) {
    const user = await prisma.usuarios.findUniqueOrThrow({
      where: { id },
      include: {
        nucleo: {
          select: {
            id: true,
            nome: true,
            estoqueAtivo: true,
            regioes: { select: { id: true, nome: true } },
          },
        },
        permissoes: { select: { id: true, name: true } },
      },
    });

    const { senha: _senha, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Busca usuário por email trazendo o hash da senha — só para o login local.
  // Nenhuma outra consulta deste model expõe `senha`.
  async findByEmailComSenha(email: string) {
    return prisma.usuarios.findUnique({
      where: { email },
      select: { id: true, senha: true },
    });
  }

  // Atualiza config opcional do próprio usuário (integrações).
  async updateConfig(id: string, config: { integracoesAtivo?: boolean }) {
    return prisma.usuarios.update({
      where: { id },
      data: config,
      select: { id: true, integracoesAtivo: true },
    });
  }

  // Retorna todos os usuários ativos
  async findAll() {
    return prisma.usuarios.findMany({
      where: { deletado: false },
      include: { nucleo: true },
    });
  }

  // Upsert de região por nome (case-insensitive). Retorna o id.
  async upsertRegiaoByNome(nome: string): Promise<string> {
    const existing = await prisma.regioes.findFirst({
      where: { nome: { equals: nome, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.regioes.create({
      data: { nome },
      select: { id: true },
    });
    return created.id;
  }

  // Upsert de núcleo por nome (case-insensitive), garantindo o vínculo à região.
  async upsertNucleoByNome(
    nome: string,
    regiaoId: string | null,
  ): Promise<string> {
    const existing = await prisma.nucleos.findFirst({
      where: { nome: { equals: nome, mode: "insensitive" } },
      select: { id: true, regioesId: true },
    });

    if (existing) {
      if (regiaoId && existing.regioesId !== regiaoId) {
        await prisma.nucleos.update({
          where: { id: existing.id },
          data: { regioes: { connect: { id: regiaoId } } },
        });
      }
      return existing.id;
    }

    const created = await prisma.nucleos.create({
      data: {
        nome,
        ...(regiaoId && { regioes: { connect: { id: regiaoId } } }),
      },
      select: { id: true },
    });
    return created.id;
  }

  // Provisiona/atualiza o usuário a partir do Cognito e define as permissões
  // (derivadas do cargo). Cognito é a fonte de verdade — sem senha local.
  async syncFromCognito(params: {
    data: CognitoUserData;
    nucleoId: string | null;
    bypass: boolean;
    permissoes: PermissionName[];
  }): Promise<{ id: string }> {
    const { data, nucleoId, bypass, permissoes } = params;

    const permByName = permissoes.map((name) => ({ name }));
    const nucleoConnect = nucleoId
      ? { nucleo: { connect: { id: nucleoId } } }
      : {};

    const base = {
      nome: data.nome,
      grau: data.grau,
      cargos: data.cargos,
      cargoNome: data.cargoNome,
      cargoCodigo: data.cargoCodigo,
      bypass,
      ...nucleoConnect,
    };

    return prisma.usuarios.upsert({
      where: { email: data.email },
      // create: relação many-to-many usa `connect`
      create: {
        email: data.email,
        ...base,
        permissoes: { connect: permByName },
      },
      // update: `set` substitui todas as permissões pelas derivadas do cargo
      update: {
        ...base,
        permissoes: { set: permByName },
      },
      select: { id: true },
    });
  }
}
