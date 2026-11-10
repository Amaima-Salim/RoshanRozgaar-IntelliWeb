import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db, getSqlClient } from "@/lib/db/client";
import { areas, conversations, jobs, offers, requests, users } from "@/lib/db/schema";
import { findCandidates, type CandidateRequest } from "@/lib/discovery/candidates";
import { requestsForWorker } from "@/lib/discovery/worker-requests";
import type { WorkerProfileInput } from "@/lib/domain/worker-profile";
import { saveWorkerProfile, setAvailability } from "@/lib/worker/profile";

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

describe("requests for a worker (why you)", () => {
  async function customerRequest(over: Partial<typeof requests.$inferInsert> = {}) {
    const s = randomUUID().slice(0, 8);
    const [c] = await db
      .insert(users)
      .values({ name: `C ${s}`, email: `cu-${s}@example.com`, role: "customer" })
      .returning();
    const [r] = await db
      .insert(requests)
      .values({
        customerId: c!.id,
        trade: "carpenter",
        source: "tap",
        lat: 33.7,
        lng: 73.0,
        areaSlug: "cand-near",
        startAt: MONDAY_10_PKT,
        durationMin: 60,
        urgency: "scheduled",
        ...over,
      })
      .returning();
    return r!.id;
  }

  it("lists open requests of the worker's trade that are near and in their hours", async () => {
    await area("cand-near", 33.7, 73.0);
    await area("cand-far", 34.6, 73.0);
    const w = await worker("cand-near");
    const near = await customerRequest();
    const far = await customerRequest({ lat: 34.6, areaSlug: "cand-far" });
    const wrongTrade = await customerRequest({ trade: "plumber" });
    const offHours = await customerRequest({ startAt: MONDAY_03_PKT });
    const cancelled = await customerRequest({ status: "cancelled" });

    const rows = await requestsForWorker(w, { now: NOW });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(near);
    for (const id of [far, wrongTrade, offHours, cancelled]) expect(ids).not.toContain(id);
    expect(rows.find((r) => r.id === near)?.why.distanceKm).toBeLessThan(1);
  });
});

describe("busy workers and the availability toggle", () => {
  async function bookJob(workerId: string, startAt: Date, endAt: Date) {
    const s = randomUUID().slice(0, 8);
    const [c] = await db
      .insert(users)
      .values({ name: `C ${s}`, email: `bj-${s}@example.com`, role: "customer" })
      .returning();
    const [r] = await db
      .insert(requests)
      .values({
        customerId: c!.id,
        trade: "carpenter",
        source: "tap",
        lat: 33.7,
        lng: 73.0,
        areaSlug: "cand-near",
        startAt,
        urgency: "scheduled",
        status: "booked",
      })
      .returning();
    const [conv] = await db
      .insert(conversations)
      .values({ requestId: r!.id, customerId: c!.id, workerId })
      .returning();
    const [offer] = await db
      .insert(offers)
      .values({
        conversationId: conv!.id,
        proposerId: workerId,
        pricePkr: 1000,
        startAt,
        durationMin: Math.round((endAt.getTime() - startAt.getTime()) / 60_000),
        status: "accepted",
      })
      .returning();
    await db.insert(jobs).values({
      requestId: r!.id,
      conversationId: conv!.id,
      offerId: offer!.id,
      customerId: c!.id,
      workerId,
      pricePkr: 1000,
      startAt,
      endAt,
      status: "confirmed",
    });
  }

  it("excludes a worker with an overlapping confirmed job, but not a back-to-back one", async () => {
    await area("cand-near", 33.7, 73.0);
    const busy = await worker("cand-near");
    const backToBack = await worker("cand-near");
    const hour = 3600_000;
    // The request runs 10:00-11:00 Karachi.
    await bookJob(
      busy,
      new Date(MONDAY_10_PKT.getTime() + 0.5 * hour),
      new Date(MONDAY_10_PKT.getTime() + 1.5 * hour),
    );
    await bookJob(backToBack, new Date(MONDAY_10_PKT.getTime() - hour), MONDAY_10_PKT);

    const ids = (await findCandidates(req(), { now: NOW })).candidates.map((c) => c.workerId);
    expect(ids).not.toContain(busy);
    expect(ids).toContain(backToBack);
  });

  it("a worker whose toggle is off is hidden from 'now' requests only", async () => {
    await area("cand-near", 33.7, 73.0);
    const w = await worker("cand-near"); // saved profiles start with the toggle off
    const nowReq = req({ startAt: MONDAY_10_PKT });
    const ids = async (now: Date, r = nowReq) =>
      (await findCandidates(r, { now })).candidates.map((c) => c.workerId);

    expect(await ids(MONDAY_10_PKT)).not.toContain(w); // "now" and toggle off
    expect(await ids(NOW)).toContain(w); // same slot booked ahead of time: not hidden (D-08)
    await setAvailability(w, true);
    expect(await ids(MONDAY_10_PKT)).toContain(w);
  });
});
