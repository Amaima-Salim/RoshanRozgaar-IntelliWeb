import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { conversations, offers, requests } from "@/lib/db/schema";
import { transition } from "@/lib/domain/job-machine";

export const cancelRequestBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(300),
});

/**
 * Cancelling before any booking (docs/01 §5: requested/negotiating → cancelled). Customer only.
 * The request is closed, its conversations are closed and its pending offers withdrawn, so
 * nobody can accept something the customer no longer wants. A booked request is cancelled
 * through its job instead (`/api/jobs/[id]/transition`).
 */
export async function cancelRequest(
  requestId: string,
  customerId: string,
  reason: string,
  now: Date = new Date(),
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.customerId, customerId)))
      .for("update");
    if (!request) throw new HttpError("NOT_FOUND");
    if (request.status !== "open")
      throw new HttpError("CONFLICT_STATE", { reason: `request_${request.status}` });

    const convs = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.requestId, requestId));
    const verdict = transition({
      state: convs.length ? "negotiating" : "requested",
      action: "cancel",
      actor: "customer",
      reason,
    });
    if (!verdict.ok) throw new HttpError("VALIDATION", { reason: verdict.reason });

    const ids = convs.map((c) => c.id);
    if (ids.length) {
      await tx
        .update(offers)
        .set({ status: "withdrawn", respondedAt: now })
        .where(and(inArray(offers.conversationId, ids), eq(offers.status, "pending")));
      await tx
        .update(conversations)
        .set({ status: "closed", updatedAt: now })
        .where(and(inArray(conversations.id, ids), eq(conversations.status, "open")));
    }
    const [updated] = await tx
      .update(requests)
      .set({ status: "cancelled", version: sql`${requests.version} + 1`, updatedAt: now })
      .where(eq(requests.id, requestId))
      .returning({ id: requests.id, status: requests.status, version: requests.version });
    return updated!;
  });
}
