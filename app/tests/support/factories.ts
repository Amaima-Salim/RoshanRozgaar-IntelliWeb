import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/client";
import { areas, conversations, jobs, offers, requests, users } from "@/lib/db/schema";

/** Minimal rows needed to insert a job: worker, customer, area, request, conversation, offer. */
export async function makeBookingContext(db: Db) {
  const suffix = randomUUID().slice(0, 8);
  const [worker] = await db
    .insert(users)
    .values({ name: `Worker ${suffix}`, email: `w-${suffix}@example.com`, role: "worker" })
    .returning();
  const [customer] = await db
    .insert(users)
    .values({ name: `Customer ${suffix}`, email: `c-${suffix}@example.com`, role: "customer" })
    .returning();
  await db
    .insert(areas)
    .values({
      slug: "g-9",
      nameEn: "G-9",
      nameUr: "جی نائن",
      city: "islamabad",
      lat: 33.69,
      lng: 73.03,
    })
    .onConflictDoNothing();
  if (!worker || !customer) throw new Error("factory insert failed");

  const makeOffer = async (startAt: Date) => {
    const [request] = await db
      .insert(requests)
      .values({
        customerId: customer.id,
        trade: "plumber",
        source: "tap",
        lat: 33.69,
        lng: 73.03,
        areaSlug: "g-9",
        startAt,
        urgency: "scheduled",
      })
      .returning();
    const [conversation] = await db
      .insert(conversations)
      .values({ requestId: request!.id, workerId: worker.id, customerId: customer.id })
      .returning();
    const [offer] = await db
      .insert(offers)
      .values({
        conversationId: conversation!.id,
        proposerId: worker.id,
        pricePkr: 1500,
        startAt,
        durationMin: 120,
      })
      .returning();
    return { request: request!, conversation: conversation!, offer: offer! };
  };

  const insertJob = async (
    startAt: Date,
    endAt: Date,
    status: "confirmed" | "in_progress" | "completed" | "cancelled" = "confirmed",
  ) => {
    const ctx = await makeOffer(startAt);
    const [job] = await db
      .insert(jobs)
      .values({
        requestId: ctx.request.id,
        conversationId: ctx.conversation.id,
        offerId: ctx.offer.id,
        customerId: customer.id,
        workerId: worker.id,
        pricePkr: 1500,
        startAt,
        endAt,
        status,
      })
      .returning();
    return job!;
  };

  return { worker, customer, insertJob };
}

/** Postgres error code from a failed query, unwrapping driver/ORM wrappers. */
export function pgCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const hours = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);
