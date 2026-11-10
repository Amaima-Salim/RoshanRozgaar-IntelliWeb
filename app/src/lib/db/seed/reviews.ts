/**
 * Seeded trust data (docs/01 §7, D-58): ~45 completed jobs with reviews, built through the same
 * request → conversation → offer → job chain as real bookings, then reputation is recomputed with
 * the very function the review route uses. All rows are `is_seeded = true` and shown as Demo.
 * Deterministic and idempotent: ids come from stable keys; previous seeded trust rows are replaced.
 */
import { inArray } from "drizzle-orm";
import type { Db } from "../client";
import { conversations, jobEvents, jobs, offers, requests, reviews } from "../schema";
import { recomputeReputation } from "../../trust/recompute";
import { AREAS, DEMO_CUSTOMERS, WORKERS, type SeedWorker } from "./data";

type Persona = "excellent" | "mixed" | "good";
type Plan = { key: string; reviews: number; persona: Persona };

/** Reviews per worker. Edge 1 is excellent, edge 5 is mixed; some workers stay review-free (edge 4). */
const PLAN: Plan[] = [
  { key: "w-elec-1", reviews: 8, persona: "excellent" },
  { key: "w-elec-5", reviews: 7, persona: "mixed" },
  { key: "w-plmb-1", reviews: 4, persona: "good" },
  { key: "w-plmb-2", reviews: 4, persona: "good" },
  { key: "w-plmb-3", reviews: 3, persona: "good" },
  { key: "w-plmb-4", reviews: 2, persona: "good" },
  { key: "w-ac-1", reviews: 3, persona: "good" },
  { key: "w-ac-2", reviews: 3, persona: "good" },
  { key: "w-ac-3", reviews: 2, persona: "good" },
  { key: "w-carp-1", reviews: 3, persona: "good" },
  { key: "w-carp-2", reviews: 2, persona: "good" },
  { key: "w-carp-3", reviews: 2, persona: "good" },
  { key: "w-mech-1", reviews: 2, persona: "good" },
];

type Template = {
  stars: number;
  onTime: boolean | null;
  quality: boolean | null;
  fairPrice: boolean | null;
  respectful: boolean | null;
  text?: string;
  lang?: "ur" | "en";
  tags?: string[];
  en?: string;
  ur?: string;
};

const EXCELLENT: Template[] = [
  {
    stars: 5,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: true,
    text: "Bohat acha kaam, waqt par aaye aur sab kuch saaf kar gaye.",
    lang: "ur",
    tags: ["punctual", "skilled", "tidy"],
    en: "Very good work, on time, and left everything clean.",
    ur: "بہت اچھا کام، وقت پر آئے اور صفائی رکھی۔",
  },
  {
    stars: 5,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: true,
    text: "Fixed the wiring problem in one visit. Honest about the price.",
    lang: "en",
    tags: ["skilled", "fair_price"],
    en: "Fixed the wiring problem in one visit at an honest price.",
    ur: "ایک ہی چکر میں وائرنگ ٹھیک کی، قیمت ایماندار تھی۔",
  },
  { stars: 5, onTime: true, quality: true, fairPrice: null, respectful: true },
  {
    stars: 4,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: true,
    text: "Acha kaam, thori der se pohanche magar bata diya tha.",
    lang: "ur",
    tags: ["skilled", "polite"],
    en: "Good work; arrived a little late but had warned in advance.",
    ur: "اچھا کام، تھوڑی دیر سے پہنچے مگر پہلے بتا دیا تھا۔",
  },
  { stars: 5, onTime: true, quality: true, fairPrice: true, respectful: true },
  {
    stars: 5,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: true,
    text: "Will call again for the next job.",
    lang: "en",
    tags: ["hire_again"],
    en: "Will call again for the next job.",
    ur: "اگلے کام کے لیے دوبارہ بلاؤں گا۔",
  },
  { stars: 5, onTime: true, quality: true, fairPrice: false, respectful: true },
  {
    stars: 5,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: true,
    text: "Mehnat se kaam kiya, bohat shaista aadmi hain.",
    lang: "ur",
    tags: ["polite", "skilled"],
    en: "Worked hard and is a very polite person.",
    ur: "محنت سے کام کیا، بہت شائستہ انسان ہیں۔",
  },
];

const MIXED: Template[] = [
  {
    stars: 4,
    onTime: true,
    quality: true,
    fairPrice: false,
    respectful: true,
    text: "Waqt par aaye, kaam theek tha lekin paise zyada liye.",
    lang: "ur",
    tags: ["punctual", "pricey"],
    en: "On time and the work was fine, but the price was high.",
    ur: "وقت پر آئے، کام ٹھیک تھا مگر پیسے زیادہ لیے۔",
  },
  {
    stars: 3,
    onTime: true,
    quality: true,
    fairPrice: false,
    respectful: true,
    text: "Punctual but expensive for a small job.",
    lang: "en",
    tags: ["punctual", "pricey"],
    en: "Punctual but expensive for a small job.",
    ur: "وقت کے پابند مگر چھوٹے کام کے لیے مہنگے۔",
  },
  { stars: 3, onTime: true, quality: null, fairPrice: false, respectful: true },
  {
    stars: 4,
    onTime: true,
    quality: true,
    fairPrice: false,
    respectful: true,
    text: "Kaam acha, rate bohat high.",
    lang: "ur",
    tags: ["skilled", "pricey"],
    en: "Good work, rate is very high.",
    ur: "کام اچھا، ریٹ بہت زیادہ۔",
  },
  { stars: 3, onTime: true, quality: false, fairPrice: false, respectful: true },
  { stars: 4, onTime: true, quality: true, fairPrice: true, respectful: true },
  {
    stars: 3,
    onTime: false,
    quality: true,
    fairPrice: false,
    respectful: true,
    text: "Came an hour late and the price was above what we discussed.",
    lang: "en",
    tags: ["late", "pricey"],
    en: "Came an hour late and charged more than discussed.",
    ur: "ایک گھنٹہ دیر سے آئے اور طے شدہ سے زیادہ لیا۔",
  },
];

const GOOD: Template[] = [
  { stars: 5, onTime: true, quality: true, fairPrice: true, respectful: true },
  {
    stars: 4,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: true,
    text: "Theek kaam kiya, time par aaye.",
    lang: "ur",
    tags: ["punctual", "skilled"],
    en: "Did the job properly and arrived on time.",
    ur: "ٹھیک کام کیا، وقت پر آئے۔",
  },
  { stars: 4, onTime: false, quality: true, fairPrice: true, respectful: true },
  {
    stars: 5,
    onTime: true,
    quality: true,
    fairPrice: true,
    respectful: null,
    text: "Clean work and fair price.",
    lang: "en",
    tags: ["tidy", "fair_price"],
    en: "Clean work at a fair price.",
    ur: "صاف کام اور مناسب قیمت۔",
  },
  { stars: 3, onTime: true, quality: false, fairPrice: true, respectful: true },
  { stars: 4, onTime: true, quality: true, fairPrice: true, respectful: true },
];

const TEMPLATES: Record<Persona, Template[]> = { excellent: EXCELLENT, mixed: MIXED, good: GOOD };
const bit = (v: boolean | null) => (v === null ? null : v ? 1 : 0);
const DAY = 86_400_000;

export const SEEDED_REVIEW_COUNT = PLAN.reduce((n, p) => n + p.reviews, 0);

/** Replaces the seeded trust rows and recomputes reputation for every seeded worker. */
export async function seedReviews(
  db: Db,
  seedUuid: (key: string) => string,
  now: Date = new Date(),
): Promise<string[]> {
  const worker = (key: string): SeedWorker => {
    const w = WORKERS.find((x) => x.key === key);
    if (!w) throw new Error(`Unknown seed worker ${key}`);
    return w;
  };

  type Row = {
    ids: { request: string; conversation: string; offer: string; job: string; review: string };
    w: SeedWorker;
    workerId: string;
    customerId: string;
    startAt: Date;
    price: number;
    t: Template;
  };
  const rows: Row[] = [];
  let n = 0;
  for (const plan of PLAN) {
    const w = worker(plan.key);
    const templates = TEMPLATES[plan.persona];
    for (let i = 0; i < plan.reviews; i++) {
      const key = `trust:${plan.key}:${i}`;
      const customer = DEMO_CUSTOMERS[(n + i) % DEMO_CUSTOMERS.length]!;
      // Several price points per trade (docs/01 §7): 80%–130% of the worker's indicative rate.
      const factor = 0.8 + ((n * 7 + i * 3) % 11) * 0.05;
      rows.push({
        ids: {
          request: seedUuid(`${key}:request`),
          conversation: seedUuid(`${key}:conversation`),
          offer: seedUuid(`${key}:offer`),
          job: seedUuid(`${key}:job`),
          review: seedUuid(`${key}:review`),
        },
        w,
        workerId: seedUuid(w.key),
        customerId: seedUuid(customer.key),
        startAt: new Date(now.getTime() - (4 + n * 2 + i) * DAY),
        price: Math.max(200, Math.round((w.ratePkr * factor) / 50) * 50),
        t: templates[i % templates.length]!,
      });
      n++;
    }
  }

  const jobIds = rows.map((r) => r.ids.job);
  await db.transaction(async (tx) => {
    // Children first. Job events cascade with their job.
    await tx.delete(reviews).where(inArray(reviews.jobId, jobIds));
    await tx.delete(jobs).where(inArray(jobs.id, jobIds));
    await tx.delete(offers).where(
      inArray(
        offers.id,
        rows.map((r) => r.ids.offer),
      ),
    );
    await tx.delete(conversations).where(
      inArray(
        conversations.id,
        rows.map((r) => r.ids.conversation),
      ),
    );
    await tx.delete(requests).where(
      inArray(
        requests.id,
        rows.map((r) => r.ids.request),
      ),
    );

    const area = (slug: string) => AREAS.find((a) => a.slug === slug)!;
    await tx.insert(requests).values(
      rows.map((r) => ({
        id: r.ids.request,
        customerId: r.customerId,
        trade: r.w.trade,
        summaryText: "Demo job (seeded).",
        summaryLang: "en" as const,
        source: "tap" as const,
        lat: area(r.w.areas[0]!).lat,
        lng: area(r.w.areas[0]!).lng,
        areaSlug: r.w.areas[0]!,
        addressText: "House 1, Street 1 (demo address)",
        startAt: r.startAt,
        durationMin: 60,
        urgency: "scheduled" as const,
        status: "booked" as const,
        isSeeded: true,
      })),
    );
    await tx.insert(conversations).values(
      rows.map((r) => ({
        id: r.ids.conversation,
        requestId: r.ids.request,
        customerId: r.customerId,
        workerId: r.workerId,
        status: "booked" as const,
        isSeeded: true,
      })),
    );
    await tx.insert(offers).values(
      rows.map((r) => ({
        id: r.ids.offer,
        conversationId: r.ids.conversation,
        proposerId: r.workerId,
        pricePkr: r.price,
        startAt: r.startAt,
        durationMin: 60,
        status: "accepted" as const,
        respondedAt: r.startAt,
        isSeeded: true,
      })),
    );
    await tx.insert(jobs).values(
      rows.map((r) => ({
        id: r.ids.job,
        requestId: r.ids.request,
        conversationId: r.ids.conversation,
        offerId: r.ids.offer,
        customerId: r.customerId,
        workerId: r.workerId,
        pricePkr: r.price,
        startAt: r.startAt,
        endAt: new Date(r.startAt.getTime() + 3_600_000),
        status: "completed" as const,
        startedAt: r.startAt,
        completionRequestedAt: new Date(r.startAt.getTime() + 3_600_000),
        completedAt: new Date(r.startAt.getTime() + 3_900_000),
        isSeeded: true,
      })),
    );
    await tx.insert(jobEvents).values(
      rows.flatMap((r) => [
        {
          jobId: r.ids.job,
          fromStatus: null,
          toStatus: "confirmed" as const,
          actorId: r.customerId,
        },
        {
          jobId: r.ids.job,
          fromStatus: "confirmed" as const,
          toStatus: "completed" as const,
          actorId: r.customerId,
          reason: "confirm-complete",
        },
      ]),
    );
    await tx.insert(reviews).values(
      rows.map((r) => ({
        id: r.ids.review,
        jobId: r.ids.job,
        customerId: r.customerId,
        workerId: r.workerId,
        stars: r.t.stars,
        sigOnTime: bit(r.t.onTime),
        sigQuality: bit(r.t.quality),
        sigFairPrice: bit(r.t.fairPrice),
        sigRespectful: bit(r.t.respectful),
        commentText: r.t.text ?? null,
        commentLang: r.t.lang ?? null,
        aiTags: r.t.tags ?? null,
        aiSummaryEn: r.t.en ?? null,
        aiSummaryUr: r.t.ur ?? null,
        customerConfirmed: !!r.t.en,
        isSeeded: true,
        createdAt: new Date(r.startAt.getTime() + 3_900_000 + 2 * 3_600_000),
      })),
    );
    // Same function as the live review route; every seeded worker, including review-free ones.
    for (const w of WORKERS) await recomputeReputation(tx, seedUuid(w.key));
  });

  return [`  trust: ${rows.length} completed jobs with reviews across ${PLAN.length} workers`];
}
