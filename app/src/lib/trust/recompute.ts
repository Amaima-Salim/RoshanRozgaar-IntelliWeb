/**
 * Reputation recompute (docs/02 §3, D-58). Kept free of `server-only` and path aliases so the
 * seed script can use the very same function the review route uses.
 */
import { and, count, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, reviews, workerReputation } from "../db/schema";
import {
  computeSignalRates,
  computeStars,
  type SignalAnswers,
  type TrustStats,
} from "../domain/trust";

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
