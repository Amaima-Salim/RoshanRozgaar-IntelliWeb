/**
 * Candidate scoring (docs/02 §6). Pure and deterministic:
 *   score = 0.40·proximity + 0.30·rating + 0.15·experience + 0.15·priceFit
 * Ties break by distance, then id. Reasons are structured so the UI can phrase them in
 * either language; nothing is fabricated (no reviews → "no reviews yet", never zero stars).
 */
import {
  BAYES_C,
  BAYES_PRIOR_MEAN,
  EXPERIENCE_CAP_YEARS,
  PRICE_FIT_NO_BUDGET,
  RANKING_WEIGHTS,
} from "./ranking-config";

export type RankInput = {
  workerId: string;
  distanceKm: number;
  yearsExperience: number;
  indicativeRatePkr: number;
  reviewCount: number;
  /** Mean of real review stars; null while there are no reviews. */
  avgStars: number | null;
};

export type RankContext = { radiusKm: number; budgetPkr: number | null };

export type Reason =
  | { kind: "distance"; km: number }
  | { kind: "free"; startAt: Date }
  | { kind: "rating"; stars: number; count: number }
  | { kind: "noReviews" }
  | { kind: "experience"; years: number }
  | { kind: "price"; pkr: number; fit: "within_budget" | "above_budget" | "no_budget" };

export type Ranked<T extends RankInput> = T & { score: number; breakdown: ScoreBreakdown };
export type ScoreBreakdown = {
  proximity: number;
  rating: number;
  experience: number;
  priceFit: number;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** (C·m + Σstars) / (C + n); with no reviews this is the prior mean. */
export function bayesStars(reviewCount: number, avgStars: number | null): number {
  const sum = avgStars === null ? 0 : avgStars * reviewCount;
  const n = avgStars === null ? 0 : reviewCount;
  return (BAYES_C * BAYES_PRIOR_MEAN + sum) / (BAYES_C + n);
}

export function priceFit(ratePkr: number, budgetPkr: number | null): number {
  if (budgetPkr === null || budgetPkr <= 0) return PRICE_FIT_NO_BUDGET;
  if (ratePkr <= budgetPkr) return 1;
  return clamp01(1 - (ratePkr - budgetPkr) / budgetPkr);
}

export function breakdownFor(c: RankInput, ctx: RankContext): ScoreBreakdown {
  return {
    proximity: clamp01(1 - Math.min(c.distanceKm / ctx.radiusKm, 1)),
    rating: clamp01((bayesStars(c.reviewCount, c.avgStars) - 1) / 4),
    experience: clamp01(Math.min(c.yearsExperience, EXPERIENCE_CAP_YEARS) / EXPERIENCE_CAP_YEARS),
    priceFit: priceFit(c.indicativeRatePkr, ctx.budgetPkr),
  };
}

export function scoreCandidate(c: RankInput, ctx: RankContext): number {
  const b = breakdownFor(c, ctx);
  const w = RANKING_WEIGHTS;
  const score =
    w.proximity * b.proximity +
    w.rating * b.rating +
    w.experience * b.experience +
    w.priceFit * b.priceFit;
  return Math.round(score * 1e6) / 1e6; // stable ordering across platforms
}

export function rankCandidates<T extends RankInput>(
  candidates: readonly T[],
  ctx: RankContext,
): Ranked<T>[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c, ctx), breakdown: breakdownFor(c, ctx) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.distanceKm - b.distanceKm ||
        (a.workerId < b.workerId ? -1 : a.workerId > b.workerId ? 1 : 0),
    );
}

export function reasonsFor(c: RankInput, ctx: RankContext, startAt: Date): Reason[] {
  const reasons: Reason[] = [
    { kind: "distance", km: Math.round(c.distanceKm * 10) / 10 },
    { kind: "free", startAt },
  ];
  reasons.push(
    c.reviewCount > 0 && c.avgStars !== null
      ? { kind: "rating", stars: Math.round(c.avgStars * 10) / 10, count: c.reviewCount }
      : { kind: "noReviews" },
  );
  reasons.push({ kind: "experience", years: c.yearsExperience });
  reasons.push({
    kind: "price",
    pkr: c.indicativeRatePkr,
    fit:
      ctx.budgetPkr === null
        ? "no_budget"
        : c.indicativeRatePkr <= ctx.budgetPkr
          ? "within_budget"
          : "above_budget",
  });
  return reasons;
}
