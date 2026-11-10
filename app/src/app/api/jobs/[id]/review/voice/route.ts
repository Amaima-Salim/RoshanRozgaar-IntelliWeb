import { z } from "zod";
import { AiUnavailableError } from "@/lib/ai/errors";
import { transcribeReviewComment } from "@/lib/ai/trust";
import { enforceLimit } from "@/lib/api/rate-limit";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";
import { sniffAudio } from "@/lib/media/audio";
import { requireReviewableJob } from "@/lib/trust/review";

type Ctx = { params: Promise<{ id: string }> };
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const durationSchema = z.coerce.number().int().min(500).max(60_000);

/**
 * A spoken review comment (≤ 60 s, ≤ 2 MB, type checked by magic bytes). The audio is stored for
 * the customer; the transcript (AI) is returned as editable text. If transcription fails the
 * audio is still attached and the customer can type instead.
 */
export const POST = route<Ctx>("jobs.review.voice", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  await requireReviewableJob(id, user.id);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES + 64 * 1024) throw new HttpError("PAYLOAD_TOO_LARGE");
  await enforceLimit(`review-voice:${user.id}`, 6, 60);

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!form || !(file instanceof File)) throw new HttpError("VALIDATION", { reason: "audio" });
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  const duration = durationSchema.safeParse(form.get("durationMs"));
  if (!duration.success) throw new HttpError("VALIDATION", { reason: "duration" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffAudio(bytes);
  if (!mime) throw new HttpError("VALIDATION", { reason: "audio_type" });

  const [stored] = await db
    .insert(media)
    .values({
      ownerId: user.id,
      kind: "audio",
      mime,
      sizeBytes: bytes.length,
      durationMs: duration.data,
      data: Buffer.from(bytes),
    })
    .returning({ id: media.id });

  try {
    const { transcript, simulated } = await transcribeReviewComment({ bytes, mime });
    return ok({
      mediaId: stored!.id,
      transcript: transcript.text,
      language: transcript.language === "en" ? "en" : "ur",
      simulated,
    });
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return ok({ mediaId: stored!.id, transcript: null, language: null, simulated: false });
  }
});
