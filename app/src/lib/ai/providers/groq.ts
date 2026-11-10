import "server-only";
import { transcriptSchema, type Transcript } from "../schemas";
import { AiUnavailableError } from "../errors";

/** Groq Whisper speech-to-text (free tier). Audio leaves the server only for this call. */
export async function groqTranscribe(
  audio: { bytes: Uint8Array; mime: string },
  opts: { apiKey: string; model: string; timeoutMs: number },
): Promise<Transcript> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }), "answer.webm");
  form.set("model", opts.model);
  form.set("language", "ur");
  form.set("response_format", "verbose_json");
  form.set("temperature", "0");
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${opts.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    throw new AiUnavailableError(
      err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "provider",
    );
  }
  if (!res.ok) throw new AiUnavailableError("provider"); // includes 429: fall back immediately, never retry
  const json = (await res.json().catch(() => null)) as {
    text?: unknown;
    language?: unknown;
  } | null;
  const parsed = transcriptSchema.safeParse({
    text: typeof json?.text === "string" ? json.text.trim() : "",
    language: typeof json?.language === "string" ? json.language : null,
  });
  if (!parsed.success) throw new AiUnavailableError("invalid");
  return parsed.data;
}
