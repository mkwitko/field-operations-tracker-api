export class ConflictError extends Error {
  constructor(message?: string) {
    super(message ?? "Conflito");
    this.name = "ConflictError";
  }
}
