import "server-only";
import { AiUnavailableError } from "../errors";

export type ImagePart = { bytes: Uint8Array; mime: string };

/** Gemini JSON-mode call over one or more images (document OCR). Caller validates the schema. */
export async function geminiVisionJson(
  system: string,
  user: string,
  images: ImagePart[],
  opts: { apiKey: string; model: string; timeoutMs: number },
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: "user",
              parts: [
                ...images.map((i) => ({
                  inlineData: { mimeType: i.mime, data: Buffer.from(i.bytes).toString("base64") },
                })),
                { text: user },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs),
      },
    );
  } catch (err) {
    throw new AiUnavailableError(
      err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "provider",
    );
  }
  if (!res.ok) throw new AiUnavailableError("provider");
  const body = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new AiUnavailableError("invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiUnavailableError("invalid");
  }
}
