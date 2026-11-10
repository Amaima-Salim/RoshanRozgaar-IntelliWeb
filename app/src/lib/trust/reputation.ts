/**
 * Worker reputation (docs/02 §3, D-58). Always recomputed from source rows (reviews, jobs) inside
 * the caller's transaction with the reputation row locked, so two concurrent reviews cannot lose
 * an update and a completed job counts even if it is never reviewed. The AI summary is generated
 * after the commit, never inside it (`refreshTrustSummary`).
 */
import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { phraseTrustSummary } from "@/lib/ai/trust";
import { db, type Db } from "@/lib/db/client";
import { jobs, reviews, workerReputation } from "@/lib/db/schema";
import {
  RECENT_REVIEWS_SHOWN,
  SUMMARY_COMMENTS_MAX,
  computeSignalRates,
  computeStars,
  readRates,
  sanitizeTags,
  templateSummary,
  type ReviewTag,
  type SignalAnswers,
  type TrustStats,
} from "@/lib/domain/trust";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Tx | Db;

const answers = (r: {
  sigOnTime: number | null;
  sigQuality: number | null;
  sigFairPrice: number | null;
  sigRespectful: number | null;
}): SignalAnswers => {
  const b = (v: number | null) => (v === null ? null : v === 1);
  return {
    onTime: b(r.sigOnTime),
    quality: b(r.sigQuality),
    fairPrice: b(r.sigFairPrice),
    respectful: b(r.sigRespectful),
  };
};

/** Recompute and store one worker's reputation. Call inside a transaction. */
export async function recomputeReputation(tx: Executor, workerId: string): Promise<TrustStats> {
  // Lock the row (creating it first) so concurrent recomputes for this worker run one at a time.
  await tx.insert(workerReputation).values({ workerId }).onConflictDoNothing();
  await tx
    .select({ id: workerReputation.workerId })
    .from(workerReputation)
    .where(eq(workerReputation.workerId, workerId))
    .for("update");

  const rows = await tx.select().from(reviews).where(eq(reviews.workerId, workerId));
  const stars = computeStars(rows);
  const rates = computeSignalRates(rows.map((r) => ({ signals: answers(r) })));

  const [done] = await tx
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.workerId, workerId), eq(jobs.status, "completed")));
  const repeat = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select customer_id from jobs
      where worker_id = ${workerId} and status = 'completed'
      group by customer_id having count(*) >= 2
    ) t`);
  const jobsCompleted = done?.n ?? 0;
  const repeatCustomers = repeat[0]?.n ?? 0;

  await tx
    .update(workerReputation)
    .set({
      reviewCount: stars.reviewCount,
      avgStars: stars.avgStars,
      bayesStars: stars.bayesStars,
      jobsCompleted,
      repeatCustomers,
      signalRates: rates,
      updatedAt: new Date(),
    })
    .where(eq(workerReputation.workerId, workerId));
  return {
    reviewCount: stars.reviewCount,
    avgStars: stars.avgStars,
    jobsCompleted,
    repeatCustomers,
    rates,
  };
}

async function loadStats(executor: Executor, workerId: string): Promise<TrustStats | null> {
  const [rep] = await executor
    .select()
    .from(workerReputation)
    .where(eq(workerReputation.workerId, workerId));
  if (!rep) return null;
  return {
    reviewCount: rep.reviewCount,
    avgStars: rep.avgStars,
    jobsCompleted: rep.jobsCompleted,
    repeatCustomers: rep.repeatCustomers,
    rates: readRates(rep.signalRates),
  };
}

/** Comments the AI summary may read: not flagged, newest first (docs/04 §5). */
async function summaryComments(executor: Executor, workerId: string): Promise<string[]> {
  const rows = await executor
    .select({ text: reviews.commentText })
    .from(reviews)
    .where(and(eq(reviews.workerId, workerId), eq(reviews.aiFlagged, false)))
    .orderBy(desc(reviews.createdAt))
    .limit(SUMMARY_COMMENTS_MAX);
  return rows.map((r) => r.text).filter((t): t is string => !!t);
}

/**
 * AI-07, run after the review transaction commits. Cached by `summary_review_count`: it is a no-op
 * when the stored phrasing already covers the current review count. When phrasing fails or is
 * rejected, any older phrasing is cleared, and pages fall back to the deterministic template.
 */
export async function refreshTrustSummary(workerId: string): Promise<void> {
  const stats = await loadStats(db, workerId);
  if (!stats) return;
  const [rep] = await db
    .select({ at: workerReputation.summaryReviewCount, en: workerReputation.summaryEn })
    .from(workerReputation)
    .where(eq(workerReputation.workerId, workerId));
  if (rep?.en && rep.at === stats.reviewCount) return;

  const phrased =
    stats.reviewCount > 0
      ? await phraseTrustSummary(stats, await summaryComments(db, workerId))
      : null;
  await db
    .update(workerReputation)
    .set(
      phrased
        ? {
            summaryEn: phrased.en,
            summaryUr: phrased.ur,
            summaryReviewCount: stats.reviewCount,
            summaryGeneratedAt: new Date(),
          }
        : { summaryEn: null, summaryUr: null, summaryReviewCount: null, summaryGeneratedAt: null },
    )
    // A newer review may have landed while the model was thinking; then this phrasing is stale.
    .where(
      and(
        eq(workerReputation.workerId, workerId),
        eq(workerReputation.reviewCount, stats.reviewCount),
      ),
    );
}

export type PublicReview = {
  id: string;
  stars: number;
  createdAt: string;
  comment: string | null;
  tags: ReviewTag[];
  isSeeded: boolean;
};

export type WorkerTrust = {
  stats: TrustStats;
  /** AI-phrased summary, present only when it passed validation and covers every review. */
  aiSummary: { en: string; ur: string; reviewCount: number } | null;
  /** Always available when there is at least one review; plain data, never labelled as AI. */
  template: { en: string; ur: string } | null;
  recent: PublicReview[];
};

const EMPTY: TrustStats = {
  reviewCount: 0,
  avgStars: null,
  jobsCompleted: 0,
  repeatCustomers: 0,
  rates: readRates(null),
};

/** What a customer sees on a worker's profile (Figma 09). Flagged comments are never included. */
export async function loadWorkerTrust(workerId: string): Promise<WorkerTrust> {
  const [rep] = await db
    .select()
    .from(workerReputation)
    .where(eq(workerReputation.workerId, workerId));
  const stats: TrustStats = rep
    ? {
        reviewCount: rep.reviewCount,
        avgStars: rep.avgStars,
        jobsCompleted: rep.jobsCompleted,
        repeatCustomers: rep.repeatCustomers,
        rates: readRates(rep.signalRates),
      }
    : EMPTY;
  const aiSummary =
    rep?.summaryEn &&
    rep.summaryUr &&
    rep.summaryReviewCount === stats.reviewCount &&
    stats.reviewCount > 0
      ? { en: rep.summaryEn, ur: rep.summaryUr, reviewCount: stats.reviewCount }
      : null;

  const recentRows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.workerId, workerId), eq(reviews.aiFlagged, false)))
    .orderBy(desc(reviews.createdAt))
    .limit(RECENT_REVIEWS_SHOWN);
  return {
    stats,
    aiSummary,
    template: templateSummary(stats),
    recent: recentRows.map((r) => ({
      id: r.id,
      stars: r.stars,
      createdAt: r.createdAt.toISOString(),
      comment: r.commentText,
      tags: sanitizeTags(r.aiTags),
      isSeeded: r.isSeeded,
    })),
  };
}
