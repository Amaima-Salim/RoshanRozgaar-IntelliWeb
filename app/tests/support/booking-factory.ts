import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { areas, conversations, offers, requests, users } from "@/lib/db/schema";
import { saveWorkerProfile, setAvailability } from "@/lib/worker/profile";

/** A Monday 10:00 Asia/Karachi, far enough ahead that "now" never gets in the way. */
export const MONDAY_10 = new Date("2030-01-07T05:00:00Z");
export const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

export async function ensureArea(slug = "bk-area", lat = 33.7, lng = 73.0) {
  await db
    .insert(areas)
    .values({ slug, nameEn: slug, nameUr: slug, city: "islamabad", lat, lng })
    .onConflictDoNothing();
  return slug;
}

/** A complete, available worker (Mondays, morning) in the shared test area. */
export async function makeWorker(areaSlug = "bk-area", over: { rate?: number } = {}) {
  const s = randomUUID().slice(0, 8);
  const [u] = await db
    .insert(users)
    .values({ name: `Worker ${s}`, email: `bw-${s}@example.com`, role: "worker" })
    .returning();
  await saveWorkerProfile(u!.id, {
    trade: "plumber",
    yearsExperience: 6,
    areaSlugs: [areaSlug],
    indicativeRatePkr: over.rate ?? 1200,
    rateBasis: "per_visit",
    weekdays: [1],
    dayParts: ["morning"],
    photoMediaId: null,
  });
  await setAvailability(u!.id, true);
  return u!.id;
}

export async function makeCustomer() {
  const s = randomUUID().slice(0, 8);
  const [u] = await db
    .insert(users)
    .values({ name: `Customer ${s}`, email: `bc-${s}@example.com`, role: "customer" })
    .returning();
  return u!.id;
}

/**
 * request → conversation → pending offer (proposed by the worker unless told otherwise), the
 * state a real chat leaves behind just before somebody presses Accept.
 */
export async function makeOffer(opts: {
  customerId: string;
  workerId: string;
  startAt?: Date;
  durationMin?: number;
  pricePkr?: number;
  proposer?: "worker" | "customer";
  addressText?: string;
}) {
  const startAt = opts.startAt ?? MONDAY_10;
  const durationMin = opts.durationMin ?? 60;
  const [request] = await db
    .insert(requests)
    .values({
      customerId: opts.customerId,
      trade: "plumber",
      source: "tap",
      lat: 33.7,
      lng: 73.0,
      areaSlug: "bk-area",
      addressText: opts.addressText ?? "House 12, Street 4, bk-area",
      startAt,
      durationMin,
      urgency: "scheduled",
    })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({ requestId: request!.id, workerId: opts.workerId, customerId: opts.customerId })
    .returning();
  const [offer] = await db
    .insert(offers)
    .values({
      conversationId: conversation!.id,
      proposerId: opts.proposer === "customer" ? opts.customerId : opts.workerId,
      pricePkr: opts.pricePkr ?? 1500,
      startAt,
      durationMin,
    })
    .returning();
  return { request: request!, conversation: conversation!, offer: offer! };
}

/** Another conversation + offer on an existing request (a second worker the customer also asked). */
export async function addSiblingOffer(requestId: string, customerId: string, workerId: string) {
  const [r] = await db.select().from(requests).where(eq(requests.id, requestId));
  const [conversation] = await db
    .insert(conversations)
    .values({ requestId, workerId, customerId })
    .returning();
  const [offer] = await db
    .insert(offers)
    .values({
      conversationId: conversation!.id,
      proposerId: workerId,
      pricePkr: 1400,
      startAt: r!.startAt,
      durationMin: r!.durationMin,
    })
    .returning();
  return { conversation: conversation!, offer: offer! };
}

/** A job that is already completed (request → conversation → accepted offer → completed job). */
export async function makeCompletedJob(opts: {
  customerId: string;
  workerId: string;
  pricePkr?: number;
  startAt?: Date;
}) {
  const { jobs } = await import("@/lib/db/schema");
  const startAt =
    opts.startAt ?? addMin(MONDAY_10, -60 * 24 * 7 * Math.floor(Math.random() * 400 + 1));
  const { request, conversation, offer } = await makeOffer({ ...opts, startAt });
  await db.update(offers).set({ status: "accepted" }).where(eq(offers.id, offer.id));
  const [job] = await db
    .insert(jobs)
    .values({
      requestId: request.id,
      conversationId: conversation.id,
      offerId: offer.id,
      customerId: opts.customerId,
      workerId: opts.workerId,
      pricePkr: opts.pricePkr ?? 1500,
      startAt,
      endAt: addMin(startAt, 60),
      status: "completed",
      completedAt: addMin(startAt, 70),
    })
    .returning();
  return job!;
}
