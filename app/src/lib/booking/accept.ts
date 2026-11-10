import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import {
  conversations,
  idempotencyKeys,
  jobEvents,
  jobs,
  offers,
  requests,
  workerProfiles,
  workerSchedule,
} from "@/lib/db/schema";
import { checkWorkerFree } from "@/lib/domain/availability";
import { findCandidates, type PublicCandidate } from "@/lib/discovery/candidates";
import { expireStale } from "./expiry";

export type AcceptedJob = {
  id: string;
  status: "confirmed";
  version: number;
  pricePkr: number;
  startAt: string;
  endAt: string;
  workerId: string;
  customerId: string;
  requestId: string;
  conversationId: string;
  offerId: string;
};

type TxResult =
  | { kind: "ok"; job: AcceptedJob; replayed?: boolean }
  | { kind: "conflict"; request: typeof requests.$inferSelect; workerId: string };

const ROUTE = "offers.accept";

/** Postgres error code from a failed query, unwrapping driver/ORM wrappers. */
function pgCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Accepting an offer is the booking (D-11, docs/02 §4). One transaction:
 * idempotency replay → lock offer and request → re-check the worker is free → INSERT the job
 * (the DB exclusion constraint is the final arbiter: 23P01 → CONFLICT_BOOKED) → close siblings →
 * record the event and the idempotent response. Nothing here waits for payment (BR-P11).
 */
export async function acceptOffer(
  offerId: string,
  actorId: string,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<{ job: AcceptedJob; replayed: boolean }> {
  const storeKey = `${actorId}:${ROUTE}:${idempotencyKey}`;

  // Lazy expiry first, outside the transaction, so "accept after expiry" reads the true state.
  const [pre] = await db
    .select({ requestId: conversations.requestId })
    .from(offers)
    .innerJoin(conversations, eq(conversations.id, offers.conversationId))
    .where(eq(offers.id, offerId));
  if (pre) await expireStale({ now, requestId: pre.requestId });

  const result = await db.transaction(async (tx): Promise<TxResult> => {
    // Serialise concurrent requests that carry the same key, so the second one replays.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${storeKey}))`);
    const [stored] = await tx
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, storeKey));
    if (stored) return { kind: "ok", job: stored.response as AcceptedJob, replayed: true };

    const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId)).for("update");
    if (!offer) throw new HttpError("NOT_FOUND");
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, offer.conversationId));
    if (!conversation) throw new HttpError("NOT_FOUND");
    if (conversation.customerId !== actorId && conversation.workerId !== actorId)
      throw new HttpError("NOT_FOUND"); // no existence leak
    if (offer.proposerId === actorId) throw new HttpError("FORBIDDEN", { reason: "own_offer" });

    if (offer.status !== "pending")
      throw new HttpError(
        "CONFLICT_STATE",
        { reason: `offer_${offer.status}` },
        { offerStatus: offer.status },
      );

    const [request] = await tx
      .select()
      .from(requests)
      .where(eq(requests.id, conversation.requestId))
      .for("update");
    if (!request) throw new HttpError("NOT_FOUND");
    if (request.status !== "open")
      throw new HttpError("CONFLICT_STATE", { reason: `request_${request.status}` });
    if (conversation.status !== "open")
      throw new HttpError("CONFLICT_STATE", { reason: `conversation_${conversation.status}` });

    const startAt = offer.startAt;
    const endAt = new Date(startAt.getTime() + offer.durationMin * 60_000);
    if (endAt.getTime() <= now.getTime())
      throw new HttpError("CONFLICT_STATE", { reason: "offer_time_passed" });

    // Serialise bookings per worker. Without this, two parallel inserts into the exclusion
    // constraint each wait on the other's uncommitted row and Postgres aborts one with a
    // deadlock (40P01) instead of a clean conflict. Lock order is always offer → request → worker.
    // Waiting here also means the availability read below sees the winner's committed job.
    const workerId = conversation.workerId;
    const [profile] = await tx
      .select()
      .from(workerProfiles)
      .where(eq(workerProfiles.userId, workerId))
      .for("update");

    // Re-check availability (the DB constraint below still has the last word).
    const [schedule, busy] = await Promise.all([
      tx.select().from(workerSchedule).where(eq(workerSchedule.workerId, workerId)),
      tx
        .select({ startAt: jobs.startAt, endAt: jobs.endAt })
        .from(jobs)
        .where(
          and(eq(jobs.workerId, workerId), inArray(jobs.status, ["confirmed", "in_progress"])),
        ),
    ]);
    const verdict = checkWorkerFree(
      { isAvailable: profile?.isAvailable ?? false, schedule, busy },
      startAt,
      endAt,
      now,
    );
    if (!verdict.free) {
      if (verdict.reason === "booked") return { kind: "conflict", request, workerId };
      throw new HttpError("CONFLICT_STATE", { reason: `worker_${verdict.reason}` });
    }

    // The insert may lose to a parallel accept: a savepoint keeps the outer transaction usable.
    let row: typeof jobs.$inferSelect | undefined;
    try {
      [row] = await tx.transaction(async (sp) =>
        sp
          .insert(jobs)
          .values({
            requestId: request.id,
            conversationId: conversation.id,
            offerId: offer.id,
            customerId: conversation.customerId,
            workerId,
            pricePkr: offer.pricePkr,
            startAt,
            endAt,
            status: "confirmed",
          })
          .returning(),
      );
    } catch (err) {
      const code = pgCode(err);
      if (code === "23P01") return { kind: "conflict", request, workerId };
      if (code === "23505") throw new HttpError("CONFLICT_STATE", { reason: "request_booked" });
      throw err;
    }
    if (!row) throw new HttpError("INTERNAL");

    await tx
      .update(offers)
      .set({ status: "accepted", respondedAt: now })
      .where(eq(offers.id, offer.id));
    // Every other open offer on this request is withdrawn; other conversations are declined.
    const siblings = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.requestId, request.id), ne(conversations.id, conversation.id)));
    const siblingIds = siblings.map((s) => s.id);
    await tx
      .update(offers)
      .set({ status: "withdrawn", respondedAt: now })
      .where(
        and(
          inArray(offers.conversationId, [conversation.id, ...siblingIds]),
          eq(offers.status, "pending"),
          ne(offers.id, offer.id),
        ),
      );
    if (siblingIds.length)
      await tx
        .update(conversations)
        .set({ status: "declined", updatedAt: now })
        .where(and(inArray(conversations.id, siblingIds), eq(conversations.status, "open")));
    await tx
      .update(conversations)
      .set({ status: "booked", updatedAt: now })
      .where(eq(conversations.id, conversation.id));
    await tx
      .update(requests)
      .set({ status: "booked", version: sql`${requests.version} + 1`, updatedAt: now })
      .where(eq(requests.id, request.id));
    await tx
      .insert(jobEvents)
      .values({ jobId: row.id, fromStatus: null, toStatus: "confirmed", actorId, reason: null });

    const job: AcceptedJob = {
      id: row.id,
      status: "confirmed",
      version: row.version,
      pricePkr: row.pricePkr,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      workerId: row.workerId,
      customerId: row.customerId,
      requestId: row.requestId,
      conversationId: row.conversationId,
      offerId: row.offerId,
    };
    await tx
      .insert(idempotencyKeys)
      .values({ key: storeKey, userId: actorId, route: ROUTE, response: job });
    return { kind: "ok", job };
  });

  if (result.kind === "ok") return { job: result.job, replayed: !!result.replayed };

  // The loser gets a specific message and next-best alternatives (Figma 13). Nothing was changed.
  const alternatives = await alternativesFor(result.request, result.workerId, actorId, now);
  throw new HttpError("CONFLICT_BOOKED", { requestId: result.request.id, alternatives });
}

/** Next-best workers for the same request, excluding the one just booked. Customer only. */
async function alternativesFor(
  request: typeof requests.$inferSelect,
  bookedWorkerId: string,
  actorId: string,
  now: Date,
): Promise<PublicCandidate[]> {
  if (request.customerId !== actorId) return [];
  const found = await findCandidates(request, { now });
  return found.candidates.filter((c) => c.workerId !== bookedWorkerId).slice(0, 3);
}
