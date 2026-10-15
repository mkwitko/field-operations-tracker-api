export class TooManyRequestsError extends Error {
  constructor(message?: string) {
    super(message ?? "Muitas tentativas, tente mais tarde");
    this.name = "TooManyRequestsError";
  }
}
