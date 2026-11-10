import { AiUnavailableError, speak } from "@/lib/ai";
import { speakBodySchema } from "@/lib/ai/schemas";
import { HttpError, parseJson, route } from "@/lib/api/respond";
import { enforceAiLimits } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { getConfig } from "@/lib/config";

/**
 * Text to speech with an Urdu (ur-PK) or English voice model (D-50). Signed-in users only, POST so
 * the text never lands in a URL or log. Returns the audio itself; failures use the JSON contract
 * and the client falls back to the browser voice, then to on-screen text.
 */
export const POST = route("ai.speak", async (request) => {
  const user = await requireUser();
  const { ai } = getConfig();
  // Mode first (D-48), then fixtures (no recorded audio for arbitrary text), then the budget.
  if (ai.mode === "off") throw new HttpError("AI_UNAVAILABLE", { reason: "off" });
  if (ai.mode === "fixtures" || !ai.tts.configured)
    throw new HttpError("AI_UNAVAILABLE", {
      reason: ai.mode === "fixtures" ? "fixtures" : "no_key",
    });
  const { text, lang } = await parseJson(request, speakBodySchema);
  await enforceAiLimits(user.id);
  try {
    const audio = await speak({ text, lang });
    return new Response(Buffer.from(audio.bytes), {
      headers: {
        "content-type": audio.mime,
        "content-length": String(audio.bytes.length),
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (err) {
    if (err instanceof AiUnavailableError)
      throw new HttpError("AI_UNAVAILABLE", { reason: err.reason });
    throw err;
  }
});
