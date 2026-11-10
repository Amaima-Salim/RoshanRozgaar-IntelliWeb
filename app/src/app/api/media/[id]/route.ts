import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";

/**
 * Streams a stored image to its owner only, with a fixed type and `nosniff` (docs/07 §2).
 * Conversation participants are added in the phase that introduces shared media.
 */
export const GET = route<{ params: Promise<{ id: string }> }>("media.get", async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const [row] = await db
    .select({ mime: media.mime, data: media.data })
    .from(media)
    .where(and(eq(media.id, id), eq(media.ownerId, user.id)));
  if (!row) throw new HttpError("NOT_FOUND");
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.mime,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
    },
  });
});
