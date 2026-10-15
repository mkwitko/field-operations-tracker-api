import { UsuariosModel } from "../../models/usuarios-model";

export async function findUsersService() {
  const userModel = new UsuariosModel();
  const users = await userModel.findAll();
  return { users };
}
