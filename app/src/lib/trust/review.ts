/**
 * Review capture (BR-P6, docs/01 O5): only the customer of a completed job, one per job, 1–5.
 * The server never trusts client AI fields: tags are re-checked against the enum, `flagged` can
 * only be raised (never lowered) by the client, and a voice note must be the customer's own.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { jobs, media, reviews } from "@/lib/db/schema";
import { commentLooksUnsafe, sanitizeTags } from "@/lib/domain/trust";
import { recomputeReputation } from "./reputation";

const signal = z.boolean().nullable();

export const reviewBodySchema = z.strictObject({
  stars: z.number().int().min(1).max(5),
  signals: z.strictObject({
    onTime: signal,
    quality: signal,
    fairPrice: signal,
    respectful: signal,
  }),
  commentText: z.string().trim().min(1).max(1000).optional(),
  commentLang: z.enum(["ur", "en"]).optional(),
  voiceMediaId: z.uuid().optional(),
  /** Present only when the customer confirmed an AI-06 draft (possibly after editing it). */
  ai: z
    .strictObject({
      tags: z.array(z.string().max(32)).max(20),
      summaryEn: z.string().trim().min(1).max(300),
      summaryUr: z.string().trim().min(1).max(300),
      flagged: z.boolean(),
    })
    .optional(),
});
export type ReviewBody = z.infer<typeof reviewBodySchema>;

const bit = (v: boolean | null) => (v === null ? null : v ? 1 : 0);

/** Gate shared by the review routes: the job's customer, job completed, not reviewed yet. */
export async function requireReviewableJob(jobId: string, actorId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || (job.customerId !== actorId && job.workerId !== actorId))
    throw new HttpError("NOT_FOUND");
  if (job.customerId !== actorId) throw new HttpError("FORBIDDEN");
  if (job.status !== "completed")
    throw new HttpError("CONFLICT_STATE", { reason: "not_completed" });
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.jobId, jobId));
  if (existing) throw new HttpError("CONFLICT_STATE", { reason: "already_reviewed" });
  return job;
}

export async function submitReview(jobId: string, actorId: string, body: ReviewBody) {
  const job = await requireReviewableJob(jobId, actorId);
  if (body.ai && !body.commentText)
    throw new HttpError("VALIDATION", { reason: "ai_without_comment" });

  if (body.voiceMediaId) {
    const [m] = await db
      .select({ id: media.id })
      .from(media)
      .where(
        and(eq(media.id, body.voiceMediaId), eq(media.ownerId, actorId), eq(media.kind, "audio")),
      );
    if (!m) throw new HttpError("VALIDATION", { reason: "voice_media" });
  }

  const texts = [body.commentText, body.ai?.summaryEn, body.ai?.summaryUr].filter(
    (t): t is string => !!t,
  );
  const flagged = (body.ai?.flagged ?? false) || texts.some(commentLooksUnsafe);

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(reviews)
        .values({
          jobId,
          customerId: actorId,
          workerId: job.workerId,
          stars: body.stars,
          sigOnTime: bit(body.signals.onTime),
          sigQuality: bit(body.signals.quality),
          sigFairPrice: bit(body.signals.fairPrice),
          sigRespectful: bit(body.signals.respectful),
          voiceMediaId: body.voiceMediaId ?? null,
          commentText: body.commentText ?? null,
          commentLang: body.commentLang ?? null,
          aiTags: body.ai ? sanitizeTags(body.ai.tags) : null,
          aiSummaryEn: body.ai?.summaryEn ?? null,
          aiSummaryUr: body.ai?.summaryUr ?? null,
          aiFlagged: flagged,
          customerConfirmed: !!body.ai,
        })
        .returning({ id: reviews.id });
      await recomputeReputation(tx, job.workerId);
      return { id: row!.id, workerId: job.workerId, flagged };
    });
  } catch (err) {
    // The unique index on job_id is the real guard against a double review (docs/02 §3).
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505")
      throw new HttpError("CONFLICT_STATE", { reason: "already_reviewed" });
    throw err;
  }
}
