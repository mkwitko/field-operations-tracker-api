import { hash } from "bcryptjs";
import { prisma } from "prisma/db";
import { BadRequestError } from "@/errors/bad-request-error";
import { ConflictError } from "@/errors/conflict-error";

interface SignUpParams {
  nome: string;
  email: string;
  senha: string;
  nucleoId: string;
}

/**
 * Cadastro local: a credencial fica no nosso banco (hash bcrypt em
 * `Usuarios.senha`), sem criar nada no Cognito.
 *
 * O Cognito continua sendo a fonte de verdade de cargo e grau — quem se cadastra
 * aqui nasce sem cargo e cai na tela de acesso pendente. Se essa pessoa depois
 * logar com a senha do Mural Digital, o `syncFromCognito` preenche o cargo na
 * mesma linha (upsert por email) e o acesso é liberado.
 */
export async function signUpService({
  nome,
  email,
  senha,
  nucleoId,
}: SignUpParams): Promise<{ userConfirmed: boolean }> {
  // 1. Núcleo precisa existir antes de criar o usuário.
  const nucleo = await prisma.nucleos.findFirst({
    where: { id: nucleoId, deletado: false },
    select: { id: true },
  });

  if (!nucleo) {
    throw new BadRequestError("Núcleo inválido");
  }

  // 2. Email é único. Uma linha com senha já cadastrada não é sobrescrita — isso
  // deixaria qualquer um trocar a senha de uma conta existente pelo signup.
  const existente = await prisma.usuarios.findUnique({
    where: { email },
    select: { id: true, senha: true },
  });

  if (existente?.senha) {
    throw new ConflictError("Email já cadastrado. Faça login.");
  }

  const senhaHash = await hash(senha, 10);

  // 3. Sem cargo: cargo e grau vêm do Cognito no login, nunca daqui.
  await prisma.usuarios.upsert({
    where: { email },
    create: {
      email,
      nome,
      senha: senhaHash,
      cargos: null,
      cargoNome: null,
      cargoCodigo: null,
      grau: null,
      nucleo: { connect: { id: nucleo.id } },
    },
    // Reaproveita a linha sem senha que sobrou de um login anterior via Cognito.
    // Ela troca de dono aqui, então cargo/grau e permissões do dono anterior são
    // zerados junto — espelha o `create`.
    update: {
      nome,
      senha: senhaHash,
      cargos: null,
      cargoNome: null,
      cargoCodigo: null,
      grau: null,
      nucleo: { connect: { id: nucleo.id } },
      permissoes: { set: [] },
    },
    select: { id: true },
  });

  // Sem verificação de email no cadastro local: o app manda direto para o login.
  return { userConfirmed: true };
}
