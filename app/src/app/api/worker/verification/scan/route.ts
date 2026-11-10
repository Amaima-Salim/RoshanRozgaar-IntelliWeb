import { AiUnavailableError, ocrCnic } from "@/lib/ai";
import { enforceAiLimits } from "@/lib/api/rate-limit";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/media/image";

async function readImage(form: FormData, key: string) {
  const file = form.get(key);
  if (!(file instanceof File)) return null;
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new HttpError("VALIDATION", { reason: "image_type" });
  return { bytes, mime };
}

/**
 * Stores the CNIC photos privately (owner-only via /api/media) and reads them with OCR.
 * OCR is a draft: if AI is off or fails the images are still saved and the worker types the
 * details (`ocr: "unavailable"`).
 */
export const POST = route("worker.verification.scan", async (request) => {
  const user = await requireRole("worker");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > 2 * MAX_IMAGE_BYTES + 128 * 1024) throw new HttpError("PAYLOAD_TOO_LARGE");
  const form = await request.formData().catch(() => null);
  if (!form) throw new HttpError("VALIDATION", { reason: "form" });
  const front = await readImage(form, "front");
  if (!front) throw new HttpError("VALIDATION", { reason: "front" });
  const back = await readImage(form, "back");

  const save = async (img: { bytes: Uint8Array; mime: string }) => {
    const [row] = await db
      .insert(media)
      .values({
        ownerId: user.id,
        kind: "image",
        mime: img.mime,
        sizeBytes: img.bytes.length,
        data: Buffer.from(img.bytes),
      })
      .returning({ id: media.id });
    return row!.id;
  };
  const frontMediaId = await save(front);
  const backMediaId = back ? await save(back) : null;

  try {
    await enforceAiLimits(user.id);
    const { draft, simulated } = await ocrCnic(back ? [front, back] : [front]);
    return ok({
      frontMediaId,
      backMediaId,
      ocr: "done" as const,
      source: simulated ? ("fixtures" as const) : ("ai" as const),
      simulated,
      draft,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError)
      return ok({
        frontMediaId,
        backMediaId,
        ocr: "unavailable" as const,
        source: "manual" as const,
        simulated: false,
        draft: null,
        reason: err.reason,
      });
    throw err;
  }
});
