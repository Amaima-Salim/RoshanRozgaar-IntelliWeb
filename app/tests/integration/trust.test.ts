import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api/respond";
import { db, getSqlClient } from "@/lib/db/client";
import { media, reviews, workerReputation } from "@/lib/db/schema";
import { __setTrustAiProvidersForTest } from "@/lib/ai/trust";
import { refreshTrustSummary, loadWorkerTrust, recomputeReputation } from "@/lib/trust/reputation";
import { reviewBodySchema, submitReview, type ReviewBody } from "@/lib/trust/review";
import {
  ensureArea,
  makeCompletedJob,
  makeCustomer,
  makeOffer,
  makeWorker,
} from "../support/booking-factory";

beforeAll(async () => {
  process.env.AI_MODE = "live";
  process.env.GEMINI_API_KEY = "test-key";
  await ensureArea();
});
afterAll(async () => {
  __setTrustAiProvidersForTest(null);
  await getSqlClient().end();
});

const good: ReviewBody = {
  stars: 5,
  signals: { onTime: true, quality: true, fairPrice: null, respectful: true },
};
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) =>
      e instanceof HttpError
        ? `${e.code}:${(e.details as { reason?: string })?.reason ?? ""}`
        : String(e),
  );
const rep = async (workerId: string) =>
  (await db.select().from(workerReputation).where(eq(workerReputation.workerId, workerId)))[0];

describe("review capture authz and rules (BR-P6)", () => {
  it("only the customer of a completed job may review, once", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const stranger = await makeCustomer();
    const job = await makeCompletedJob({ customerId: c, workerId: w });

    expect(await code(submitReview(job.id, stranger, good))).toBe("NOT_FOUND:");
    expect(await code(submitReview(job.id, w, good))).toBe("FORBIDDEN:");
    expect(await code(submitReview(randomUUID(), c, good))).toBe("NOT_FOUND:");
    expect(await code(submitReview(job.id, c, good))).toBe("ok");
    expect(await code(submitReview(job.id, c, good))).toBe("CONFLICT_STATE:already_reviewed");
    expect(await db.select().from(reviews).where(eq(reviews.jobId, job.id))).toHaveLength(1);
  });

  it("refuses a job that is not completed", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const { request } = await makeOffer({ customerId: c, workerId: w });
    // No job exists for a bare offer: indistinguishable from a missing job for the caller.
    expect(await code(submitReview(request.id, c, good))).toBe("NOT_FOUND:");
  });

  it("validates stars and rejects unknown fields at the boundary", () => {
    expect(reviewBodySchema.safeParse({ ...good, stars: 0 }).success).toBe(false);
    expect(reviewBodySchema.safeParse({ ...good, stars: 6 }).success).toBe(false);
    expect(reviewBodySchema.safeParse({ ...good, stars: 4.5 }).success).toBe(false);
    expect(reviewBodySchema.safeParse({ ...good, customerId: randomUUID() }).success).toBe(false);
    expect(reviewBodySchema.safeParse(good).success).toBe(true);
  });

  it("a voice note must be the customer's own audio", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const other = await makeCustomer();
    const job = await makeCompletedJob({ customerId: c, workerId: w });
    const [theirs] = await db
      .insert(media)
      .values({
        ownerId: other,
        kind: "audio",
        mime: "audio/webm",
        sizeBytes: 4,
        data: Buffer.from([1, 2, 3, 4]),
      })
      .returning({ id: media.id });
    expect(await code(submitReview(job.id, c, { ...good, voiceMediaId: theirs!.id }))).toBe(
      "VALIDATION:voice_media",
    );
  });
});

describe("reputation is atomic and recomputed from source rows (D-58)", () => {
  it("updates count, average, Bayesian score, rates, jobs and repeat customers", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const c2 = await makeCustomer();
    const j1 = await makeCompletedJob({ customerId: c, workerId: w });
    await makeCompletedJob({ customerId: c, workerId: w }); // repeat customer, never reviewed
    const j3 = await makeCompletedJob({ customerId: c2, workerId: w });
    await submitReview(j1.id, c, { ...good, stars: 5 });
    await submitReview(j3.id, c2, {
      stars: 3,
      signals: { onTime: false, quality: true, fairPrice: false, respectful: null },
    });
    const r = (await rep(w))!;
    expect(r.reviewCount).toBe(2);
    expect(r.avgStars).toBeCloseTo(4);
    expect(r.bayesStars).toBeCloseTo((3 * 3.5 + 8) / (3 + 2));
    expect(r.jobsCompleted).toBe(3);
    expect(r.repeatCustomers).toBe(1);
    expect(r.signalRates).toMatchObject({
      onTime: { yes: 1, total: 2 },
      respectful: { yes: 1, total: 1 },
    });
  });

  it("a completed job counts even if it is never reviewed", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    await makeCompletedJob({ customerId: c, workerId: w });
    await db.transaction((tx) => recomputeReputation(tx, w));
    expect(await rep(w)).toMatchObject({ reviewCount: 0, jobsCompleted: 1, avgStars: null });
  });

  it("concurrent reviews for one worker lose no update", async () => {
    const w = await makeWorker();
    const customers = await Promise.all([
      makeCustomer(),
      makeCustomer(),
      makeCustomer(),
      makeCustomer(),
    ]);
    const jobs = await Promise.all(
      customers.map((c) => makeCompletedJob({ customerId: c, workerId: w })),
    );
    await Promise.all(jobs.map((j, i) => submitReview(j.id, customers[i]!, { ...good, stars: 4 })));
    expect((await rep(w))!.reviewCount).toBe(4);
  });

  it("a failed review leaves no review and no reputation change", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const job = await makeCompletedJob({ customerId: c, workerId: w });
    await submitReview(job.id, c, good);
    const before = (await rep(w))!.reviewCount;
    await submitReview(job.id, c, good).catch(() => undefined);
    expect((await rep(w))!.reviewCount).toBe(before);
  });
});

describe("flagged content (docs/04 §5 default)", () => {
  it("keeps stars and signals but holds the comment back from the public list", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const c2 = await makeCustomer();
    const j1 = await makeCompletedJob({ customerId: c, workerId: w });
    const j2 = await makeCompletedJob({ customerId: c2, workerId: w });
    // The client says "not flagged"; the server still finds the abuse and flags it.
    await submitReview(j1.id, c, {
      ...good,
      stars: 1,
      commentText: "he is a bastard",
      commentLang: "en",
      ai: { tags: ["rude"], summaryEn: "Rude.", summaryUr: "بدتمیز", flagged: false },
    });
    await submitReview(j2.id, c2, { ...good, commentText: "came on time", commentLang: "en" });
    expect((await rep(w))!.reviewCount).toBe(2);
    const trust = await loadWorkerTrust(w);
    expect(trust.recent.map((r) => r.comment)).toEqual(["came on time"]);
    expect(trust.stats.reviewCount).toBe(2);
  });

  it("the client can raise the flag but tags are re-checked against the enum", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const job = await makeCompletedJob({ customerId: c, workerId: w });
    const r = await submitReview(job.id, c, {
      ...good,
      commentText: "fine",
      ai: { tags: ["punctual", "verified"], summaryEn: "Fine.", summaryUr: "ٹھیک", flagged: true },
    });
    expect(r.flagged).toBe(true);
    const [row] = await db.select().from(reviews).where(eq(reviews.id, r.id));
    expect(row!.aiTags).toEqual(["punctual"]);
    expect(row!.customerConfirmed).toBe(true);
  });
});

describe("AI-07 summary caching and fallback", () => {
  const provider = (out: unknown, calls: { n: number }) => ({
    transcribe: async () => ({ text: "x", language: "ur" }),
    draftReview: async () => ({}),
    phraseSummary: async () => {
      calls.n += 1;
      return out;
    },
  });

  it("stores a grounded phrasing once per review count, and drops a hallucinated one", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const job = await makeCompletedJob({ customerId: c, workerId: w });
    await submitReview(job.id, c, good);

    const calls = { n: 0 };
    __setTrustAiProvidersForTest(
      provider({ en: "Rated 5.0 out of 5 from 1 review.", ur: "1 جائزے میں 5 میں سے 5.0۔" }, calls),
    );
    await refreshTrustSummary(w);
    await refreshTrustSummary(w); // cached by summary_review_count
    expect(calls.n).toBe(1);
    const t = await loadWorkerTrust(w);
    expect(t.aiSummary).toMatchObject({ reviewCount: 1 });
    expect(t.template).not.toBeNull();

    // A second review makes the stored phrasing stale; a hallucinating model must not replace it.
    const c2 = await makeCustomer();
    const job2 = await makeCompletedJob({ customerId: c2, workerId: w });
    await submitReview(job2.id, c2, good);
    __setTrustAiProvidersForTest(provider({ en: "Rated 5.0 from 900 reviews.", ur: "900" }, calls));
    await refreshTrustSummary(w);
    const after = await loadWorkerTrust(w);
    expect(after.aiSummary).toBeNull();
    expect(after.template?.en).toContain("2 reviews");
  });

  it("a failing provider never breaks the review or the profile", async () => {
    const w = await makeWorker();
    const c = await makeCustomer();
    const job = await makeCompletedJob({ customerId: c, workerId: w });
    await submitReview(job.id, c, good);
    __setTrustAiProvidersForTest({
      ...provider({}, { n: 0 }),
      phraseSummary: async () => {
        throw new Error("down");
      },
    });
    await refreshTrustSummary(w);
    expect((await loadWorkerTrust(w)).aiSummary).toBeNull();
  });

  it("a worker with no reviews has no summary and no average", async () => {
    const w = await makeWorker();
    const t = await loadWorkerTrust(w);
    expect(t.stats.avgStars).toBeNull();
    expect(t.template).toBeNull();
    expect(t.aiSummary).toBeNull();
  });
});
