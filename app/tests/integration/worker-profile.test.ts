import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, getSqlClient } from "@/lib/db/client";
import { areas, media, users, workerSchedule } from "@/lib/db/schema";
import type { WorkerProfileInput } from "@/lib/domain/worker-profile";
import {
  ProfileInputError,
  loadWorkerProfile,
  saveWorkerProfile,
  setAvailability,
} from "@/lib/worker/profile";

afterAll(async () => {
  await getSqlClient().end();
});

async function makeWorker() {
  const s = randomUUID().slice(0, 8);
  const [u] = await db
    .insert(users)
    .values({ name: `W ${s}`, email: `w-${s}@example.com`, role: "worker" })
    .returning();
  for (const [slug, lat] of [
    ["f-7", 33.72],
    ["g-9", 33.69],
  ] as const) {
    await db
      .insert(areas)
      .values({ slug, nameEn: slug, nameUr: slug, city: "islamabad", lat, lng: 73.0 })
      .onConflictDoNothing();
  }
  return u!;
}

const input = (over: Partial<WorkerProfileInput> = {}): WorkerProfileInput => ({
  trade: "electrician",
  yearsExperience: 4,
  areaSlugs: ["f-7", "g-9"],
  indicativeRatePkr: 1500,
  rateBasis: "per_visit",
  weekdays: [1, 2, 3],
  dayParts: ["morning", "afternoon"],
  photoMediaId: null,
  ...over,
});

describe("worker profile persistence (O1)", () => {
  it("starts empty and incomplete", async () => {
    const w = await makeWorker();
    const state = await loadWorkerProfile(w.id);
    expect(state.exists).toBe(false);
    expect(state.onboardingComplete).toBe(false);
  });

  it("saves a complete profile, its weekly hours, and marks onboarding complete", async () => {
    const w = await makeWorker();
    await saveWorkerProfile(w.id, input());
    const state = await loadWorkerProfile(w.id);
    expect(state.onboardingComplete).toBe(true);
    expect(state.answers).toMatchObject({
      trade: "electrician",
      yearsExperience: 4,
      areaSlugs: ["f-7", "g-9"],
      indicativeRatePkr: 1500,
      rateBasis: "per_visit",
      weekdays: [1, 2, 3],
      dayParts: ["morning", "afternoon"],
    });
    const rows = await db.select().from(workerSchedule).where(eq(workerSchedule.workerId, w.id));
    expect(rows).toHaveLength(3); // one merged range per weekday
  });

  it("re-saving replaces the schedule instead of piling up rows", async () => {
    const w = await makeWorker();
    await saveWorkerProfile(w.id, input());
    await saveWorkerProfile(w.id, input({ weekdays: [6], dayParts: ["evening"] }));
    const rows = await db.select().from(workerSchedule).where(eq(workerSchedule.workerId, w.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weekday: 6, startMin: 1020, endMin: 1320 });
  });

  it("refuses an area that does not exist, and saves nothing", async () => {
    const w = await makeWorker();
    await expect(saveWorkerProfile(w.id, input({ areaSlugs: ["atlantis"] }))).rejects.toThrow(
      ProfileInputError,
    );
    expect((await loadWorkerProfile(w.id)).exists).toBe(false);
  });

  it("refuses someone else's photo", async () => {
    const owner = await makeWorker();
    const other = await makeWorker();
    const [photo] = await db
      .insert(media)
      .values({
        ownerId: owner.id,
        kind: "image",
        mime: "image/jpeg",
        sizeBytes: 3,
        data: Buffer.from([0xff, 0xd8, 0xff]),
      })
      .returning();
    await expect(saveWorkerProfile(other.id, input({ photoMediaId: photo!.id }))).rejects.toThrow(
      ProfileInputError,
    );
    await saveWorkerProfile(owner.id, input({ photoMediaId: photo!.id }));
  });
});

describe("availability toggle", () => {
  it("cannot be switched on before onboarding is complete", async () => {
    const w = await makeWorker();
    expect(await setAvailability(w.id, true)).toBe(false);
  });

  it("persists once onboarding is complete", async () => {
    const w = await makeWorker();
    await saveWorkerProfile(w.id, input());
    expect((await loadWorkerProfile(w.id)).isAvailable).toBe(false);
    expect(await setAvailability(w.id, true)).toBe(true);
    expect((await loadWorkerProfile(w.id)).isAvailable).toBe(true);
    expect(await setAvailability(w.id, false)).toBe(true);
    expect((await loadWorkerProfile(w.id)).isAvailable).toBe(false);
  });
});
