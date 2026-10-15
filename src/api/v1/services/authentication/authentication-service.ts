import { compare } from "bcryptjs";
import { UsuariosModel } from "../../models/usuarios-model";
import { cognitoSignIn } from "./cognito-service";
import {
  applyMockClaims,
  isMockClaimsEmail,
  mockBypass,
} from "./apply-mock-claims";
import { deriveAccess } from "../authorization/derive-access";
import { EmailNaoConfirmadoError } from "@/errors/email-nao-confirmado-error";
import { BadRequestError } from "@/errors/bad-request-error";
import { env } from "@/env";
import type { CognitoClaims } from "./cognito-service";

interface AuthenticationParams {
  email: string;
  password: string;
}

const bypassEmails = env.BYPASS_EMAILS.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function authenticationService({
  email,
  password,
}: AuthenticationParams) {
  const usuariosModel = new UsuariosModel();

  // 1. Cognito primeiro: é a fonte de verdade de cargo e grau, então quem tem
  // conta no Mural Digital entra por aqui e sai com as permissões aplicadas.
  let claims: CognitoClaims;
  try {
    claims = await cognitoSignIn({ email, password });
  } catch (erro) {
    // Conta existe no pool mas falta confirmar o email — não é caso de tentar
    // senha local, o app precisa abrir a tela do código.
    if (erro instanceof EmailNaoConfirmadoError) throw erro;

    // 1b. Cadastro local: credencial no nosso banco. Sem cargo, então o
    // /me devolve acessoLiberado false e o app mostra acesso pendente.
    return { user: await autenticarLocalmente({ email, password }) };
  }

  // 1b. Mock de claims (só dev + email de bypass) — testar cargo/grau/escopo.
  let bypass = bypassEmails.includes(claims.email.toLowerCase());
  if (isMockClaimsEmail(claims.email, bypassEmails)) {
    claims = applyMockClaims(claims);
    bypass = mockBypass();
    console.log("[MOCK] claims aplicados:", {
      grau: claims.grau,
      cargos: claims.cargos,
      cargoCodigo: claims.cargoCodigo,
      nucleoNome: claims.nucleoNome,
      regiaoNome: claims.regiaoNome,
      bypass,
    });
  }

  // 2. Derivação de acesso/permissões a partir de grau/cargos.
  const access = deriveAccess({
    grau: claims.grau,
    cargosClaim: claims.cargos,
    cargoCodigo: claims.cargoCodigo,
    bypass,
  });

  // 3. Falta de cargo não bloqueia o login: o app mostra a tela de acesso
  // pendente a partir de `acessoLiberado` no /me. As rotas protegidas seguem
  // barradas pelo requireAcessoLiberado (acesso-liberado-middleware).

  // 4. Provisiona região → núcleo (criados se não existirem, match por nome).
  const regiaoId = claims.regiaoNome
    ? await usuariosModel.upsertRegiaoByNome(claims.regiaoNome)
    : null;
  const nucleoId = claims.nucleoNome
    ? await usuariosModel.upsertNucleoByNome(claims.nucleoNome, regiaoId)
    : null;

  // 5. Provisiona/atualiza o usuário e aplica as permissões derivadas.
  const { id } = await usuariosModel.syncFromCognito({
    data: {
      email: claims.email,
      nome: claims.nome,
      grau: claims.grau,
      cargos: claims.cargos,
      cargoNome: claims.cargoNome,
      cargoCodigo: claims.cargoCodigo,
    },
    nucleoId,
    bypass,
    permissoes: access.permissoes,
  });

  // 6. Retorna o usuário completo (sem senha) para emissão do nosso JWT.
  const user = await usuariosModel.findById(id);

  return { user };
}

/**
 * Autentica contra o hash bcrypt gravado no signup local.
 *
 * A mensagem de erro é a mesma do Cognito de propósito: quem tenta adivinhar não
 * descobre por qual caminho o email existe.
 */
async function autenticarLocalmente({ email, password }: AuthenticationParams) {
  const usuariosModel = new UsuariosModel();
  const local = await usuariosModel.findByEmailComSenha(email);

  // `senha` é nula para quem foi provisionado pelo Cognito. Sem este guard, o
  // compare rodaria contra hash vazio.
  if (!local?.senha) {
    throw new BadRequestError("Credenciais inválidas");
  }

  const senhaCorreta = await compare(password, local.senha);

  if (!senhaCorreta) {
    throw new BadRequestError("Credenciais inválidas");
  }

  return usuariosModel.findById(local.id);
}
