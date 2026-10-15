export class BadRequestError extends Error {
  constructor(message?: string) {
    super(message || "Solicitação inválida");
    this.name = "BadRequestError";
  }
}
