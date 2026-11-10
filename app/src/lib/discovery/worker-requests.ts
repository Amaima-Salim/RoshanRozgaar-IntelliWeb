import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { areas, jobs, requests, workerProfiles, workerSchedule } from "@/lib/db/schema";
import { checkWorkerFree } from "@/lib/domain/availability";
import { distanceKm, roundKm } from "@/lib/domain/geo";
import { DEFAULT_RADIUS_KM } from "@/lib/domain/ranking-config";

export type WorkerRequestRow = {
  id: string;
  trade: (typeof requests.$inferSelect)["trade"];
  summaryText: string | null;
  photoMediaId: string | null;
  areaNameEn: string;
  areaNameUr: string;
  startAt: Date;
  urgency: (typeof requests.$inferSelect)["urgency"];
  /** "Why you": the same facts the customer's ranking used. No customer identity, no exact point. */
  why: { distanceKm: number; free: true; sameTrade: true };
};

/**
 * Open requests this worker could take: same trade, inside the radius, and free at the requested
 * time by the same rule as the customer-side search (docs/02 §5).
 */
export async function requestsForWorker(
  workerId: string,
  opts: { now?: Date; radiusKm?: number } = {},
): Promise<WorkerRequestRow[]> {
  const now = opts.now ?? new Date();
  const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM;
  const [profile] = await db
    .select()
    .from(workerProfiles)
    .where(
      and(eq(workerProfiles.userId, workerId), eq(workerProfiles.onboardingStatus, "complete")),
    );
  if (!profile?.trade || profile.baseLat === null || profile.baseLng === null) return [];

  const open = await db
    .select({
      id: requests.id,
      trade: requests.trade,
      summaryText: requests.summaryText,
      photoMediaId: requests.photoMediaId,
      lat: requests.lat,
      lng: requests.lng,
      startAt: requests.startAt,
      durationMin: requests.durationMin,
      urgency: requests.urgency,
      areaNameEn: areas.nameEn,
      areaNameUr: areas.nameUr,
    })
    .from(requests)
    .innerJoin(areas, eq(areas.slug, requests.areaSlug))
    .where(
      and(
        eq(requests.status, "open"),
        eq(requests.trade, profile.trade),
        gt(requests.startAt, new Date(now.getTime() - 60 * 60_000)),
      ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(50);
  if (!open.length) return [];

  const [schedule, busy] = await Promise.all([
    db.select().from(workerSchedule).where(eq(workerSchedule.workerId, workerId)),
    db
      .select({ startAt: jobs.startAt, endAt: jobs.endAt })
      .from(jobs)
      .where(
        and(
          eq(jobs.workerId, workerId),
          inArray(jobs.status, ["confirmed", "in_progress"]),
          gt(jobs.endAt, now),
        ),
      ),
  ]);
  const me = { isAvailable: profile.isAvailable, schedule, busy };
  const base = { lat: profile.baseLat, lng: profile.baseLng };

  const rows: WorkerRequestRow[] = [];
  for (const r of open) {
    const km = distanceKm(base, { lat: r.lat, lng: r.lng });
    if (km > radiusKm) continue;
    const end = new Date(r.startAt.getTime() + r.durationMin * 60_000);
    if (!checkWorkerFree(me, r.startAt, end, now).free) continue;
    rows.push({
      id: r.id,
      trade: r.trade,
      summaryText: r.summaryText,
      photoMediaId: r.photoMediaId,
      areaNameEn: r.areaNameEn,
      areaNameUr: r.areaNameUr,
      startAt: r.startAt,
      urgency: r.urgency,
      why: { distanceKm: roundKm(km), free: true, sameTrade: true },
    });
    if (rows.length === 10) break;
  }
  return rows;
}
