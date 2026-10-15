export class EmailNaoConfirmadoError extends Error {
  constructor(message?: string) {
    super(message ?? "Confirme seu email para entrar");
    this.name = "EmailNaoConfirmadoError";
  }
}
