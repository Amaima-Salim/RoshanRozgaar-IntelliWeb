import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { areas, media, workerProfiles, workerSchedule } from "@/lib/db/schema";
import {
  emptyAnswers,
  scheduleRows,
  tilesFromSchedule,
  type ProfileAnswers,
  type WorkerProfileInput,
} from "@/lib/domain/worker-profile";

export type WorkerProfileState = {
  answers: ProfileAnswers;
  onboardingComplete: boolean;
  isAvailable: boolean;
  exists: boolean;
};

/** The worker's saved answers; empty when they have not started. */
export async function loadWorkerProfile(userId: string): Promise<WorkerProfileState> {
  const [profile] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    return {
      answers: emptyAnswers(),
      onboardingComplete: false,
      isAvailable: false,
      exists: false,
    };
  }
  const rows = await db
    .select({
      weekday: workerSchedule.weekday,
      startMin: workerSchedule.startMin,
      endMin: workerSchedule.endMin,
    })
    .from(workerSchedule)
    .where(eq(workerSchedule.workerId, userId));
  const tiles = tilesFromSchedule(rows);
  return {
    exists: true,
    onboardingComplete: profile.onboardingStatus === "complete",
    isAvailable: profile.isAvailable,
    answers: {
      trade: profile.trade,
      yearsExperience: profile.yearsExperience,
      areaSlugs: profile.areaSlugs,
      indicativeRatePkr: profile.indicativeRatePkr,
      rateBasis: profile.rateBasis,
      weekdays: tiles.weekdays,
      dayParts: tiles.dayParts,
      photoMediaId: profile.photoMediaId,
    },
  };
}

export class ProfileInputError extends Error {
  constructor(readonly reason: "unknown_area" | "bad_photo") {
    super(reason);
  }
}

/**
 * Saves a complete profile in one transaction and marks onboarding complete (docs/01 §3 O1).
 * Areas must exist; the photo must be the worker's own image. The private base point is the
 * centroid of the first chosen area (approximate, never shown to customers).
 */
export async function saveWorkerProfile(userId: string, input: WorkerProfileInput) {
  const areaSlugs = [...new Set(input.areaSlugs)];
  await db.transaction(async (tx) => {
    const found = await tx
      .select({ slug: areas.slug, lat: areas.lat, lng: areas.lng })
      .from(areas)
      .where(inArray(areas.slug, areaSlugs));
    if (found.length !== areaSlugs.length) throw new ProfileInputError("unknown_area");
    const base = found.find((a) => a.slug === areaSlugs[0])!;

    if (input.photoMediaId) {
      const [photo] = await tx
        .select({ id: media.id })
        .from(media)
        .where(
          and(eq(media.id, input.photoMediaId), eq(media.ownerId, userId), eq(media.kind, "image")),
        );
      if (!photo) throw new ProfileInputError("bad_photo");
    }

    const values = {
      trade: input.trade,
      yearsExperience: input.yearsExperience,
      indicativeRatePkr: input.indicativeRatePkr,
      rateBasis: input.rateBasis,
      areaSlugs,
      baseLat: base.lat,
      baseLng: base.lng,
      photoMediaId: input.photoMediaId,
      onboardingStatus: "complete" as const,
      updatedAt: new Date(),
    };
    await tx
      .insert(workerProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: workerProfiles.userId, set: values });

    await tx.delete(workerSchedule).where(eq(workerSchedule.workerId, userId));
    await tx
      .insert(workerSchedule)
      .values(
        scheduleRows(input.weekdays, input.dayParts).map((r) => ({ workerId: userId, ...r })),
      );
  });
}

/** Persists the availability toggle. Returns false when there is no completed profile yet. */
export async function setAvailability(userId: string, isAvailable: boolean): Promise<boolean> {
  const updated = await db
    .update(workerProfiles)
    .set({ isAvailable, updatedAt: new Date() })
    .where(and(eq(workerProfiles.userId, userId), eq(workerProfiles.onboardingStatus, "complete")))
    .returning({ userId: workerProfiles.userId });
  return updated.length > 0;
}
