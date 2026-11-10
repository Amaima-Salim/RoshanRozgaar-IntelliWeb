import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { conversations, jobEvents, jobs, requests } from "@/lib/db/schema";
import { transition, type JobAction } from "@/lib/domain/job-machine";
import { recomputeReputation } from "@/lib/trust/reputation";

export const TRANSITIONS = ["start", "request-complete", "confirm-complete", "cancel"] as const;
export type TransitionName = (typeof TRANSITIONS)[number];

const ACTION: Record<TransitionName, JobAction> = {
  start: "start",
  "request-complete": "request_complete",
  "confirm-complete": "confirm_complete",
  cancel: "cancel",
};

export const transitionBodySchema = z.strictObject({
  action: z.enum(TRANSITIONS),
  /** The version the client last saw (optimistic concurrency). */
  version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(300).optional(),
});

export type JobRow = typeof jobs.$inferSelect;

/**
 * Role-checked, versioned job transitions (docs/02 §4). The row is only changed by
 * `UPDATE … WHERE id AND version AND status`; zero rows means somebody else got there first,
 * and the caller gets CONFLICT_STATE with the current row, never a silent overwrite.
 */
export async function transitionJob(
  jobId: string,
  actorId: string,
  body: z.infer<typeof transitionBodySchema>,
  now: Date = new Date(),
): Promise<JobRow> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || (job.customerId !== actorId && job.workerId !== actorId))
    throw new HttpError("NOT_FOUND");
  const actor = job.customerId === actorId ? "customer" : "worker";

  const verdict = transition({
    state: job.status,
    action: ACTION[body.action],
    actor,
    reason: body.reason,
    completionRequested: job.completionRequestedAt !== null,
  });
  if (!verdict.ok) {
    // A role mistake is FORBIDDEN; a state or input mistake is reported with the current row.
    if (verdict.reason === "wrong_actor")
      throw new HttpError("FORBIDDEN", { reason: verdict.reason });
    if (verdict.reason === "reason_required")
      throw new HttpError("VALIDATION", { reason: verdict.reason });
    throw new HttpError("CONFLICT_STATE", { reason: verdict.reason }, jobSnapshot(job));
  }
  if (body.version !== job.version)
    throw new HttpError("CONFLICT_STATE", { reason: "stale_version" }, jobSnapshot(job));

  // Jobs only ever move between these four stored states; the machine's other states are not rows.
  const to = verdict.to as "confirmed" | "in_progress" | "completed" | "cancelled";
  const set: Partial<typeof jobs.$inferInsert> = {
    status: to,
    updatedAt: now,
    version: sql`${jobs.version} + 1` as unknown as number,
  };
  if (body.action === "start") set.startedAt = now;
  if (body.action === "request-complete") set.completionRequestedAt = now;
  if (body.action === "confirm-complete") set.completedAt = now;
  if (body.action === "cancel") {
    set.cancelledAt = now;
    set.cancelReason = body.reason ?? null;
    set.cancelledBy = actorId;
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(jobs)
      .set(set)
      .where(and(eq(jobs.id, jobId), eq(jobs.version, body.version), eq(jobs.status, job.status)))
      .returning();
    if (!updated) {
      const [current] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
      throw new HttpError(
        "CONFLICT_STATE",
        { reason: "changed_meanwhile" },
        current ? jobSnapshot(current) : undefined,
      );
    }
    await tx.insert(jobEvents).values({
      jobId,
      fromStatus: job.status,
      toStatus: updated.status,
      actorId,
      reason: body.action === "cancel" ? (body.reason ?? null) : body.action,
    });

    // A completed job counts toward jobs completed and repeat customers even if never reviewed.
    if (body.action === "confirm-complete") await recomputeReputation(tx, job.workerId);

    if (body.action === "cancel") {
      // The window is freed by the status change itself (the exclusion constraint only covers
      // confirmed/in_progress). The customer's request: cancelled by the customer, reopened when
      // the worker cancelled so the customer can choose someone else (D-55).
      await tx
        .update(conversations)
        .set({ status: "closed", updatedAt: now })
        .where(eq(conversations.id, job.conversationId));
      await tx
        .update(requests)
        .set({
          status: actor === "customer" ? "cancelled" : "open",
          version: sql`${requests.version} + 1`,
          updatedAt: now,
        })
        .where(eq(requests.id, job.requestId));
    }
    return updated;
  });
}

export const jobSnapshot = (j: JobRow) => ({
  id: j.id,
  status: j.status,
  version: j.version,
  completionRequested: j.completionRequestedAt !== null,
});
