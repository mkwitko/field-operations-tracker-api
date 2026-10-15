import { acessoLiberado } from "../authorization/acesso-liberado";
import { UsuariosModel } from "../../models/usuarios-model";

export async function findUserByIdService({ id }: { id: string }) {
  const userModel = new UsuariosModel();
  const user = await userModel.findById(id);

  return {
    user: {
      ...user,
      acessoLiberado: acessoLiberado({
        grau: user.grau,
        cargos: user.cargos,
        cargoCodigo: user.cargoCodigo,
        bypass: user.bypass,
      }),
    },
  };
}
