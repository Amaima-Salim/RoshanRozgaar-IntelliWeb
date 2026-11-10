import "server-only";
import { transcriptSchema, type Transcript } from "../schemas";
import { AiUnavailableError } from "../errors";

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

/** Groq Whisper speech-to-text (free tier). Audio leaves the server only for this call. */
export async function groqTranscribe(
  audio: { bytes: Uint8Array; mime: string },
  opts: { apiKey: string; model: string; timeoutMs: number },
): Promise<Transcript> {
  const form = new FormData();
  // Whisper picks the decoder from the file name, so it must match the sniffed type (Safari records mp4).
  const ext = EXT[audio.mime] ?? "webm";
  form.set("file", new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }), `answer.${ext}`);
  form.set("model", opts.model);
  // Auto-detect: customers and workers can speak either Urdu or English.
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
  const detected = typeof json?.language === "string" ? json.language.trim().toLowerCase() : null;
  const language = detected === "english" ? "en" : detected === "urdu" ? "ur" : detected;
  const parsed = transcriptSchema.safeParse({
    text: typeof json?.text === "string" ? json.text.trim() : "",
    language,
  });
  if (!parsed.success) throw new AiUnavailableError("invalid");
  return parsed.data;
}

type GroqOptions = { apiKey: string; model: string; timeoutMs: number };
type GroqContent =
  string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

/** JSON object mode; each task still validates the returned object with its own Zod schema. */
async function completeJson(
  system: string,
  content: GroqContent,
  opts: GroqOptions,
): Promise<unknown> {
  if (!opts.apiKey) throw new AiUnavailableError("no_key");
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        // Vision has a tighter output quota; text reasoning needs room before the final JSON.
        max_completion_tokens: typeof content === "string" ? 2048 : 768,
        ...(opts.model.startsWith("openai/gpt-oss-") ? { reasoning_effort: "low" } : {}),
        ...(opts.model === "qwen/qwen3.8-27b" ? { reasoning_effort: "none" } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    throw new AiUnavailableError(
      err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "provider",
    );
  }
  if (!res.ok) throw new AiUnavailableError("provider");
  try {
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("missing content");
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("not an object");
    return value;
  } catch {
    throw new AiUnavailableError("invalid");
  }
}

export function groqJson(system: string, user: string, opts: GroqOptions): Promise<unknown> {
  return completeJson(system, user, opts);
}

export function groqVisionJson(
  system: string,
  user: string,
  images: { bytes: Uint8Array; mime: string }[],
  opts: GroqOptions,
): Promise<unknown> {
  return completeJson(
    system,
    [
      { type: "text", text: user },
      ...images.map((image) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`,
        },
      })),
    ],
    opts,
  );
}
