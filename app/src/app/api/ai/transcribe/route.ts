import { z } from "zod";
import { AiUnavailableError, transcribe } from "@/lib/ai";
import { getConfig } from "@/lib/config";
import { HttpError, ok, route } from "@/lib/api/respond";
import { enforceAiLimits } from "@/lib/api/rate-limit";
import { requireRole } from "@/lib/auth/guards";
import { sniffAudio } from "@/lib/media/audio";
import { STEP_IDS } from "@/lib/domain/worker-profile";

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const fieldsSchema = z.object({
  stepId: z.enum(STEP_IDS).optional(),
  durationMs: z.coerce.number().int().min(700).max(60_000),
});

/** Speech to text for one spoken answer (AI-01): ≤ 2 MB, 0.7–60 s, type checked by magic bytes. */
export const POST = route("ai.transcribe", async (request) => {
  const user = await requireRole("worker");
  // AI switched off: say so plainly, before spending any rate-limit budget.
  if (getConfig().ai.mode === "off") throw new HttpError("AI_UNAVAILABLE", { reason: "off" });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES + 64 * 1024) throw new HttpError("PAYLOAD_TOO_LARGE");
  await enforceAiLimits(user.id);

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!form || !(file instanceof File)) throw new HttpError("VALIDATION", { reason: "audio" });
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  const fields = fieldsSchema.safeParse({
    stepId: form.get("stepId") ?? undefined,
    durationMs: form.get("durationMs"),
  });
  if (!fields.success) throw new HttpError("VALIDATION", { reason: "fields" });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffAudio(bytes);
  if (!mime) throw new HttpError("VALIDATION", { reason: "audio_type" });

  try {
    const result = await transcribe({ bytes, mime }, { stepId: fields.data.stepId });
    return ok({
      text: result.transcript.text,
      language: result.transcript.language,
      simulated: result.simulated,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError)
      throw new HttpError("AI_UNAVAILABLE", { reason: err.reason });
    throw err;
  }
});
