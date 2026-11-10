import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  jobs,
  requests,
  users,
  workerProfiles,
  workerReputation,
  workerSchedule,
} from "@/lib/db/schema";
import { checkWorkerFree, type FreeVerdict } from "@/lib/domain/availability";
import { distanceKm, roundKm, roundPublicPoint } from "@/lib/domain/geo";
import { rankCandidates, reasonsFor, type Reason } from "@/lib/domain/ranking";
import { DEFAULT_RADIUS_KM, RANKING_VERSION, WIDEN_RADIUS_KM } from "@/lib/domain/ranking-config";

export type CandidateRequest = {
  trade: (typeof requests.$inferSelect)["trade"];
  lat: number;
  lng: number;
  startAt: Date;
  durationMin: number;
  budgetPkr: number | null;
};

export type PublicCandidate = {
  workerId: string;
  name: string;
  trade: CandidateRequest["trade"];
  photoMediaId: string | null;
  distanceKm: number;
  yearsExperience: number;
  indicativeRatePkr: number;
  rateBasis: string;
  reviewCount: number;
  avgStars: number | null;
  /** Rounded to about 500 m; the exact base point never leaves the server (docs/07). */
  approx: { lat: number; lng: number };
  isDemo: boolean;
  score: number;
  reasons: Reason[];
};

export type NoMatchSuggestion = "widen_radius" | "change_time" | "change_trade";

export type CandidatesResult = {
  rankingVersion: string;
  radiusKm: number;
  center: { lat: number; lng: number };
  startAt: string;
  endAt: string;
  candidates: PublicCandidate[];
  noMatch: null | { suggestions: NoMatchSuggestion[]; widerRadiusKm: number | null };
};

/**
 * Trade + radius + free-at-that-time filter, then the ranking from docs/02 §6.
 * Anyone excluded here is never shown as available.
 */
export async function findCandidates(
  req: CandidateRequest,
  opts: { radiusKm?: number; now?: Date } = {},
): Promise<CandidatesResult> {
  const now = opts.now ?? new Date();
  const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM;
  const endAt = new Date(req.startAt.getTime() + req.durationMin * 60_000);
  const center = { lat: req.lat, lng: req.lng };

  const rows = await db
    .select({
      workerId: workerProfiles.userId,
      name: users.name,
      trade: workerProfiles.trade,
      photoMediaId: workerProfiles.photoMediaId,
      years: workerProfiles.yearsExperience,
      rate: workerProfiles.indicativeRatePkr,
      basis: workerProfiles.rateBasis,
      baseLat: workerProfiles.baseLat,
      baseLng: workerProfiles.baseLng,
      isAvailable: workerProfiles.isAvailable,
      isDemo: workerProfiles.isSeeded,
      reviewCount: workerReputation.reviewCount,
      avgStars: workerReputation.avgStars,
    })
    .from(workerProfiles)
    .innerJoin(users, eq(users.id, workerProfiles.userId))
    .leftJoin(workerReputation, eq(workerReputation.workerId, workerProfiles.userId))
    .where(
      and(eq(workerProfiles.trade, req.trade), eq(workerProfiles.onboardingStatus, "complete")),
    );

  const ids = rows.map((r) => r.workerId);
  const [schedule, busy] = ids.length
    ? await Promise.all([
        db.select().from(workerSchedule).where(inArray(workerSchedule.workerId, ids)),
        db
          .select({ workerId: jobs.workerId, startAt: jobs.startAt, endAt: jobs.endAt })
          .from(jobs)
          .where(
            and(
              inArray(jobs.workerId, ids),
              inArray(jobs.status, ["confirmed", "in_progress"]),
              gt(jobs.endAt, now),
            ),
          ),
      ])
    : [[], []];

  const eligible: Omit<PublicCandidate, "score" | "reasons">[] = [];
  for (const r of rows) {
    if (r.baseLat === null || r.baseLng === null || r.years === null || r.rate === null) continue;
    const km = distanceKm(center, { lat: r.baseLat, lng: r.baseLng });
    if (km > radiusKm) continue;
    const verdict: FreeVerdict = checkWorkerFree(
      {
        isAvailable: r.isAvailable,
        schedule: schedule.filter((s) => s.workerId === r.workerId),
        busy: busy.filter((b) => b.workerId === r.workerId),
      },
      req.startAt,
      endAt,
      now,
    );
    if (!verdict.free) continue;
    eligible.push({
      workerId: r.workerId,
      name: r.name ?? "",
      trade: req.trade,
      photoMediaId: r.photoMediaId,
      distanceKm: roundKm(km),
      yearsExperience: r.years,
      indicativeRatePkr: r.rate,
      rateBasis: r.basis ?? "per_visit",
      reviewCount: r.reviewCount ?? 0,
      avgStars: r.reviewCount ? r.avgStars : null,
      approx: roundPublicPoint({ lat: r.baseLat, lng: r.baseLng }),
      isDemo: r.isDemo,
    });
  }

  const ctx = { radiusKm, budgetPkr: req.budgetPkr };
  const candidates = rankCandidates(eligible, ctx).map((c) => ({
    ...c,
    score: c.score,
    reasons: reasonsFor(c, ctx, req.startAt),
  }));

  return {
    rankingVersion: RANKING_VERSION,
    radiusKm,
    center: roundPublicPoint(center),
    startAt: req.startAt.toISOString(),
    endAt: endAt.toISOString(),
    candidates: candidates.map(({ breakdown: _b, ...rest }) => rest as PublicCandidate),
    noMatch: candidates.length
      ? null
      : {
          suggestions: [
            ...(radiusKm < WIDEN_RADIUS_KM ? (["widen_radius"] as const) : []),
            "change_time",
          ],
          widerRadiusKm: radiusKm < WIDEN_RADIUS_KM ? WIDEN_RADIUS_KM : null,
        },
  };
}

