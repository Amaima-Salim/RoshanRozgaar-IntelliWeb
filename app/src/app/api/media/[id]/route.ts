import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";

/**
 * Streams stored media with a fixed type and `nosniff` (docs/07 §2): to its owner, or to either
 * participant of a conversation whose message carries it (voice notes). Anyone else gets 404.
 */
export const GET = route<{ params: Promise<{ id: string }> }>("media.get", async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const [row] = await db
    .select({ mime: media.mime, data: media.data })
    .from(media)
    .where(
      and(
        eq(media.id, id),
        sql`(${media.ownerId} = ${user.id} OR EXISTS (
          SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE m.media_id = ${media.id} AND (c.customer_id = ${user.id} OR c.worker_id = ${user.id})))`,
      ),
    );
  if (!row) throw new HttpError("NOT_FOUND");
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.mime,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
    },
  });
});
