export class ForbiddenError extends Error {
  constructor(message?: string) {
    super(message ?? "Permissões insuficientes");
    this.name = "ForbiddenError";
  }
}
