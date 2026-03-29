export class ProviderRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRuntimeError";
  }
}
