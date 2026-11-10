/** AI could not help (mode off, provider down, timeout, bad output). Callers fall back to taps. */
export class AiUnavailableError extends Error {
  constructor(readonly reason: "off" | "timeout" | "provider" | "invalid" | "no_key") {
    super(`AI unavailable: ${reason}`);
    this.name = "AiUnavailableError";
  }
}
