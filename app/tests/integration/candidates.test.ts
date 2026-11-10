import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db, getSqlClient } from "@/lib/db/client";
import { areas, users } from "@/lib/db/schema";
import { findCandidates, type CandidateRequest } from "@/lib/discovery/candidates";
import type { WorkerProfileInput } from "@/lib/domain/worker-profile";
import { saveWorkerProfile } from "@/lib/worker/profile";

afterAll(async () => {
  await getSqlClient().end();
});

const NOW = new Date("2030-01-01T06:00:00Z"); // a Tuesday
const MONDAY_10_PKT = new Date("2030-01-07T05:00:00Z");
const MONDAY_03_PKT = new Date("2030-01-06T22:00:00Z");

async function area(slug: string, lat: number, lng: number) {
  await db
    .insert(areas)
    .values({ slug, nameEn: slug, nameUr: slug, city: "islamabad", lat, lng })
    .onConflictDoNothing();
}

async function worker(areaSlug: string, over: Partial<WorkerProfileInput> = {}) {
  const s = randomUUID().slice(0, 8);
  const [u] = await db
    .insert(users)
    .values({ name: `W ${s}`, email: `c-${s}@example.com`, role: "worker" })
    .returning();
  await saveWorkerProfile(u!.id, {
    trade: "carpenter",
    yearsExperience: 5,
    areaSlugs: [areaSlug],
    indicativeRatePkr: 1000,
    rateBasis: "per_visit",
    weekdays: [1],
    dayParts: ["morning"],
    photoMediaId: null,
    ...over,
  });
  return u!.id;
}

const req = (over: Partial<CandidateRequest> = {}): CandidateRequest => ({
  trade: "carpenter",
  lat: 33.7,
  lng: 73.0,
  startAt: MONDAY_10_PKT,
  durationMin: 60,
  budgetPkr: null,
  ...over,
});

describe("candidates (O2)", () => {
  it("keeps matching, nearby, free workers and drops far, wrong-trade and off-hours ones", async () => {
    await area("cand-near", 33.7, 73.0);
    await area("cand-far", 34.6, 73.0);
    const near = await worker("cand-near");
    const far = await worker("cand-far");
    const wrongTrade = await worker("cand-near", { trade: "plumber" });
    const offHours = await worker("cand-near", { weekdays: [6] });

    const res = await findCandidates(req(), { now: NOW });
    const ids = res.candidates.map((c) => c.workerId);
    expect(ids).toContain(near);
    expect(ids).not.toContain(far);
    expect(ids).not.toContain(wrongTrade);
    expect(ids).not.toContain(offHours);
    expect(res.noMatch).toBeNull();
  });

  it("explains each result and only exposes rounded coordinates", async () => {
    await area("cand-near", 33.7, 73.0);
    const id = await worker("cand-near");
    const res = await findCandidates(req(), { now: NOW });
    const c = res.candidates.find((x) => x.workerId === id)!;
    expect(c.reasons.map((r) => r.kind)).toEqual([
      "distance",
      "free",
      "noReviews",
      "experience",
      "price",
    ]);
    expect(c.avgStars).toBeNull();
    expect(Math.abs(c.approx.lat - 33.7)).toBeLessThan(0.005);
    expect(JSON.stringify(res)).not.toMatch(/baseLat|baseLng/);
  });

  it("returns an honest no-match with next steps when nobody is free", async () => {
    await area("cand-near", 33.7, 73.0);
    await worker("cand-near");
    const res = await findCandidates(req({ startAt: MONDAY_03_PKT }), { now: NOW });
    expect(res.candidates).toHaveLength(0);
    expect(res.noMatch?.suggestions).toEqual(["widen_radius", "change_time"]);
    expect(res.noMatch?.widerRadiusKm).toBe(20);
  });

  it("a wider radius brings the far worker back", async () => {
    await area("cand-far", 34.6, 73.0);
    const far = await worker("cand-far");
    const res = await findCandidates(req(), { now: NOW, radiusKm: 150 });
    expect(res.candidates.map((c) => c.workerId)).toContain(far);
  });
});
