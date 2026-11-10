import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/media/image";

/** Optional photo of the problem on a request: ≤ 1 MB after client compression, type checked by magic bytes. */
export const POST = route("requests.photo", async (request) => {
  const user = await requireRole("customer");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError("PAYLOAD_TOO_LARGE");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError("VALIDATION", { reason: "file" });
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new HttpError("VALIDATION", { reason: "image_type" });
  const [row] = await db
    .insert(media)
    .values({
      ownerId: user.id,
      kind: "image",
      mime,
      sizeBytes: bytes.length,
      data: Buffer.from(bytes),
    })
    .returning({ id: media.id });
  return ok({ mediaId: row!.id });
});
