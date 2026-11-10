import { describe, expect, it } from "vitest";
import { checkWorkerFree, isWorkerFree, type WorkerAvailability } from "@/lib/domain/availability";
import { distanceKm, nearestArea, roundKm, roundPublicPoint } from "@/lib/domain/geo";
import {
  bayesStars,
  priceFit,
  rankCandidates,
  reasonsFor,
  scoreCandidate,
  type RankInput,
} from "@/lib/domain/ranking";
import { RANKING_WEIGHTS } from "@/lib/domain/ranking-config";
import { parseKarachiLocal, startForChip } from "@/lib/domain/time";

describe("geo", () => {
  it("Haversine: zero for the same point, ~111 km per degree of latitude", () => {
    const p = { lat: 33.7, lng: 73.05 };
    expect(distanceKm(p, p)).toBe(0);
    expect(distanceKm({ lat: 33, lng: 73 }, { lat: 34, lng: 73 })).toBeCloseTo(111.2, 0);
  });
  it("F-7 to G-9 is a few km", () => {
    const d = distanceKm({ lat: 33.7205, lng: 73.0562 }, { lat: 33.6935, lng: 73.0295 });
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(5);
  });
  it("is symmetric", () => {
    const a = { lat: 33.7, lng: 73 };
    const b = { lat: 33.6, lng: 73.1 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });
  it("roundKm keeps one decimal", () => {
    expect(roundKm(2.149)).toBe(2.1);
    expect(roundKm(2.15)).toBe(2.2);
  });
  it("public coordinates snap to ~500 m and never equal a precise point", () => {
    const precise = { lat: 33.72051234, lng: 73.05629876 };
    const pub = roundPublicPoint(precise);
    expect(pub).toEqual({ lat: 33.72, lng: 73.055 });
    expect(distanceKm(precise, pub)).toBeLessThan(0.5);
    expect(roundPublicPoint(pub)).toEqual(pub); // idempotent
  });
  it("nearestArea returns the closest or null when too far", () => {
    const areas = [
      { slug: "a", lat: 33.7, lng: 73.0 },
      { slug: "b", lat: 33.6, lng: 73.1 },
    ];
    expect(nearestArea({ lat: 33.61, lng: 73.09 }, areas)?.area.slug).toBe("b");
    expect(nearestArea({ lat: 31.5, lng: 74.3 }, areas)).toBeNull(); // Lahore
  });
});

// 2026-11-10 is a Tuesday (weekday 2). Karachi = UTC+5, so 10:00 PKT = 05:00 UTC.
const at = (hhmm: string, day = "2026-11-10") => new Date(`${day}T${hhmm}:00+05:00`);
const worker = (over: Partial<WorkerAvailability> = {}): WorkerAvailability => ({
  isAvailable: true,
  schedule: [{ weekday: 2, startMin: 9 * 60, endMin: 18 * 60 }],
  busy: [],
  ...over,
});

describe("availability (D-08)", () => {
  const now = at("08:00");
  it("free inside hours with no conflict", () => {
    expect(isWorkerFree(worker(), at("10:00"), at("12:00"), now)).toBe(true);
  });
  it("outside weekly hours, and on a day with no hours", () => {
    expect(checkWorkerFree(worker(), at("07:00"), at("09:00"), now)).toEqual({
      free: false,
      reason: "outside_hours",
    });
    expect(checkWorkerFree(worker(), at("17:00"), at("19:00"), now)).toMatchObject({
      reason: "outside_hours",
    });
    expect(
      checkWorkerFree(worker(), at("10:00", "2026-11-11"), at("12:00", "2026-11-11"), now),
    ).toMatchObject({ reason: "outside_hours" });
  });
  it("hours are inclusive at both ends", () => {
    expect(isWorkerFree(worker(), at("09:00"), at("18:00"), now)).toBe(true);
  });
  it("a window crossing midnight never fits one day's hours", () => {
    const w = worker({ schedule: [{ weekday: 2, startMin: 0, endMin: 1440 }] });
    expect(isWorkerFree(w, at("23:00"), at("01:00", "2026-11-11"), now)).toBe(false);
  });
  it("uses Karachi time, not UTC, for the weekday", () => {
    // 02:00 PKT Wednesday is still Tuesday in UTC; the schedule is Karachi-local.
    const w = worker({ schedule: [{ weekday: 3, startMin: 60, endMin: 240 }] });
    expect(
      isWorkerFree(
        w,
        at("02:00", "2026-11-11"),
        at("03:00", "2026-11-11"),
        at("00:00", "2026-11-11"),
      ),
    ).toBe(true);
  });
  it("toggle OFF excludes an ASAP request but not a future one", () => {
    const off = worker({ isAvailable: false });
    expect(checkWorkerFree(off, at("08:10"), at("10:10"), now)).toMatchObject({
      reason: "toggle_off",
    }); // the toggle is checked first for an ASAP request
    const offInHours = worker({
      isAvailable: false,
      schedule: [{ weekday: 2, startMin: 0, endMin: 1440 }],
    });
    expect(checkWorkerFree(offInHours, at("08:10"), at("10:10"), now)).toEqual({
      free: false,
      reason: "toggle_off",
    });
    expect(isWorkerFree(offInHours, at("14:00"), at("16:00"), now)).toBe(true);
  });
  it("toggle boundary: 15 minutes ahead still counts as now", () => {
    const w = worker({ isAvailable: false, schedule: [{ weekday: 2, startMin: 0, endMin: 1440 }] });
    expect(isWorkerFree(w, at("08:15"), at("10:15"), now)).toBe(false);
    expect(isWorkerFree(w, at("08:16"), at("10:16"), now)).toBe(true);
  });
  it("overlapping confirmed jobs make a worker busy; back-to-back is fine", () => {
    const busy = [{ startAt: at("10:00"), endAt: at("12:00") }];
    expect(checkWorkerFree(worker({ busy }), at("11:00"), at("13:00"), now)).toEqual({
      free: false,
      reason: "booked",
    });
    expect(checkWorkerFree(worker({ busy }), at("09:00"), at("10:30"), now)).toMatchObject({
      reason: "booked",
    });
    expect(checkWorkerFree(worker({ busy }), at("10:30"), at("11:30"), now)).toMatchObject({
      reason: "booked",
    });
    expect(isWorkerFree(worker({ busy }), at("12:00"), at("14:00"), now)).toBe(true);
    expect(isWorkerFree(worker({ busy }), at("08:00"), at("10:00"), at("07:00"))).toBe(false); // outside hours (before 09:00)
    expect(isWorkerFree(worker({ busy }), at("09:00"), at("10:00"), now)).toBe(true);
  });
  it("rejects an empty or reversed window", () => {
    expect(isWorkerFree(worker(), at("10:00"), at("10:00"), now)).toBe(false);
    expect(isWorkerFree(worker(), at("12:00"), at("10:00"), now)).toBe(false);
  });
});

const cand = (over: Partial<RankInput> = {}): RankInput => ({
  workerId: "w1",
  distanceKm: 2,
  yearsExperience: 5,
  indicativeRatePkr: 1000,
  reviewCount: 0,
  avgStars: null,
  ...over,
});
const ctx = { radiusKm: 10, budgetPkr: null };

describe("ranking (docs/02 §6)", () => {
  it("weights sum to 1", () => {
    const w = RANKING_WEIGHTS;
    expect(w.proximity + w.rating + w.experience + w.priceFit).toBeCloseTo(1, 10);
  });
  it("Bayesian stars: no reviews = prior mean; many reviews approach the real mean", () => {
    expect(bayesStars(0, null)).toBe(3.5);
    expect(bayesStars(300, 5)).toBeGreaterThan(4.9);
    expect(bayesStars(1, 5)).toBeCloseTo((3 * 3.5 + 5) / 4, 10);
  });
  it("price fit: within budget 1, linear decay above, floor 0, neutral without budget", () => {
    expect(priceFit(800, 1000)).toBe(1);
    expect(priceFit(1500, 1000)).toBeCloseTo(0.5, 10);
    expect(priceFit(3000, 1000)).toBe(0);
    expect(priceFit(900, null)).toBe(0.5);
  });
  it("closer is better, all else equal", () => {
    const near = scoreCandidate(cand({ distanceKm: 1 }), ctx);
    const far = scoreCandidate(cand({ distanceKm: 9 }), ctx);
    expect(near).toBeGreaterThan(far);
  });
  it("proximity bottoms out at the radius and never goes negative", () => {
    const edge = scoreCandidate(cand({ distanceKm: 10 }), ctx);
    const beyond = scoreCandidate(cand({ distanceKm: 40 }), ctx);
    expect(beyond).toBe(edge);
  });
  it("experience is capped at 15 years", () => {
    expect(scoreCandidate(cand({ yearsExperience: 15 }), ctx)).toBe(
      scoreCandidate(cand({ yearsExperience: 40 }), ctx),
    );
  });
  it("a new worker is not scored as zero stars", () => {
    const fresh = scoreCandidate(cand(), ctx);
    const bad = scoreCandidate(cand({ reviewCount: 10, avgStars: 1 }), ctx);
    expect(fresh).toBeGreaterThan(bad);
  });
  it("excellent ratings can outrank a slightly closer worker", () => {
    const ranked = rankCandidates(
      [
        cand({ workerId: "close-unrated", distanceKm: 1.5 }),
        cand({ workerId: "far-great", distanceKm: 3, reviewCount: 40, avgStars: 4.9 }),
      ],
      ctx,
    );
    expect(ranked[0]?.workerId).toBe("far-great");
  });
  it("two workers differing only by price: cheaper wins with a budget, tie otherwise", () => {
    const a = cand({ workerId: "a", indicativeRatePkr: 1500 });
    const b = cand({ workerId: "b", indicativeRatePkr: 800 });
    expect(rankCandidates([a, b], { radiusKm: 10, budgetPkr: 1000 })[0]?.workerId).toBe("b");
    const noBudget = rankCandidates([a, b], ctx);
    expect(noBudget[0]?.score).toBe(noBudget[1]?.score);
  });
  it("ties break by distance, then id (stable)", () => {
    const x = cand({ workerId: "b", distanceKm: 20 });
    const y = cand({ workerId: "a", distanceKm: 30 });
    const z = cand({ workerId: "c", distanceKm: 30 });
    expect(rankCandidates([z, y, x], ctx).map((r) => r.workerId)).toEqual(["b", "a", "c"]);
    expect(rankCandidates([x, y, z], ctx).map((r) => r.workerId)).toEqual(["b", "a", "c"]);
  });
  it("scores stay inside 0..1", () => {
    const best = scoreCandidate(
      cand({ distanceKm: 0, yearsExperience: 99, reviewCount: 999, avgStars: 5 }),
      { radiusKm: 10, budgetPkr: 5000 },
    );
    expect(best).toBeLessThanOrEqual(1);
    expect(best).toBeGreaterThan(0.9);
    expect(
      scoreCandidate(
        cand({
          distanceKm: 99,
          yearsExperience: 0,
          reviewCount: 999,
          avgStars: 1,
          indicativeRatePkr: 99999,
        }),
        { radiusKm: 10, budgetPkr: 100 },
      ),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("reasons (honest and bilingual-ready)", () => {
  const start = at("14:00");
  it("rating with count, or 'no reviews yet' — never 0 stars", () => {
    expect(reasonsFor(cand({ reviewCount: 18, avgStars: 4.63 }), ctx, start)).toContainEqual({
      kind: "rating",
      stars: 4.6,
      count: 18,
    });
    const fresh = reasonsFor(cand(), ctx, start);
    expect(fresh).toContainEqual({ kind: "noReviews" });
    expect(fresh.some((r) => r.kind === "rating")).toBe(false);
  });
  it("always states distance and the free window", () => {
    const r = reasonsFor(cand({ distanceKm: 2.14 }), ctx, start);
    expect(r).toContainEqual({ kind: "distance", km: 2.1 });
    expect(r).toContainEqual({ kind: "free", startAt: start });
  });
  it("explains the price against the budget", () => {
    expect(
      reasonsFor(cand({ indicativeRatePkr: 900 }), { radiusKm: 10, budgetPkr: 1000 }, start),
    ).toContainEqual({ kind: "price", pkr: 900, fit: "within_budget" });
    expect(
      reasonsFor(cand({ indicativeRatePkr: 1800 }), { radiusKm: 10, budgetPkr: 1000 }, start),
    ).toContainEqual({ kind: "price", pkr: 1800, fit: "above_budget" });
    expect(reasonsFor(cand(), ctx, start)).toContainEqual({
      kind: "price",
      pkr: 1000,
      fit: "no_budget",
    });
  });
});

describe("when chips", () => {
  const NOW = new Date("2030-01-01T06:00:00Z"); // 11:00 in Karachi
  it("this evening is 18:00 Karachi today", () => {
    expect(startForChip("evening", NOW).toISOString()).toBe("2030-01-01T13:00:00.000Z");
  });
  it("this evening after 18:00 becomes half an hour from now", () => {
    const late = new Date("2030-01-01T14:00:00Z"); // 19:00 Karachi
    expect(startForChip("evening", late).getTime()).toBe(late.getTime() + 30 * 60_000);
  });
  it("tomorrow is 10:00 Karachi", () => {
    expect(startForChip("tomorrow", NOW).toISOString()).toBe("2030-01-02T05:00:00.000Z");
  });
  it("parses the picker value as Karachi wall time and rejects junk", () => {
    expect(parseKarachiLocal("2030-01-07T10:00")?.toISOString()).toBe("2030-01-07T05:00:00.000Z");
    expect(parseKarachiLocal("tomorrow")).toBeNull();
  });
});
