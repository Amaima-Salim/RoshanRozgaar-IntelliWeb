import "server-only";
import { AiUnavailableError } from "../errors";

/**
 * Text to speech (spoken prompts, D-50). Two interchangeable providers:
 *   - azure (default): Azure Speech neural voices ur-PK-UzmaNeural / ur-PK-AsadNeural, MP3.
 *   - gemini: Gemini TTS. Google does not list Urdu as supported (it detects the language from the
 *     text), so it is opt-in only. Returns WAV, or headerless 16-bit PCM which we wrap as WAV.
 * Only fixed app text or a worker's own read-back is ever sent; never names, phones or addresses.
 */
export type SpeechLang = "ur" | "en";
export type SpeechAudio = { bytes: Uint8Array; mime: "audio/wav" | "audio/mpeg" };

const timeoutError = (err: unknown) =>
  new AiUnavailableError(
    err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "provider",
  );

/** Little-endian 16-bit mono PCM → a playable WAV file. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const ascii = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

const GEMINI_VOICE: Record<SpeechLang, string> = { ur: "Kore", en: "Kore" };

export async function geminiSpeak(
  text: string,
  lang: SpeechLang,
  opts: { apiKey: string; model: string; timeoutMs: number },
): Promise<SpeechAudio> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            // No languageCode: ur-PK is not on its accepted list; the model detects the language.
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE[lang] } },
            },
          },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs),
      },
    );
  } catch (err) {
    throw timeoutError(err);
  }
  if (!res.ok) throw new AiUnavailableError("provider");
  const body = (await res.json().catch(() => null)) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    }[];
  } | null;
  const inline = body?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) throw new AiUnavailableError("invalid");
  const raw = Uint8Array.from(Buffer.from(inline.data, "base64"));
  if (raw.length === 0) throw new AiUnavailableError("invalid");
  // Unary responses may already be a complete WAV file; only headerless PCM gets a header.
  const isWav = String.fromCharCode(...raw.slice(0, 4)) === "RIFF";
  if (isWav) return { bytes: raw, mime: "audio/wav" };
  const pcm = raw;
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? 24_000);
  return { bytes: pcmToWav(pcm, rate), mime: "audio/wav" };
}

const AZURE_VOICE: Record<SpeechLang, { locale: string; voice: string }> = {
  ur: { locale: "ur-PK", voice: "ur-PK-UzmaNeural" },
  en: { locale: "en-US", voice: "en-US-AvaNeural" },
};

const xmlEscape = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

export async function azureSpeak(
  text: string,
  lang: SpeechLang,
  opts: { apiKey: string; region: string; urVoice?: string; timeoutMs: number },
): Promise<SpeechAudio> {
  const { locale, voice: defaultVoice } = AZURE_VOICE[lang];
  const voice = lang === "ur" && opts.urVoice ? opts.urVoice : defaultVoice;
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${xmlEscape(voice)}">${xmlEscape(text)}</voice></speak>`;
  let res: Response;
  try {
    res = await fetch(
      `https://${encodeURIComponent(opts.region)}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": opts.apiKey,
          "content-type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "user-agent": "roshan-rozgar",
        },
        body: ssml,
        signal: AbortSignal.timeout(opts.timeoutMs),
      },
    );
  } catch (err) {
    throw timeoutError(err);
  }
  if (!res.ok) throw new AiUnavailableError("provider");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) throw new AiUnavailableError("invalid");
  return { bytes, mime: "audio/mpeg" };
}
