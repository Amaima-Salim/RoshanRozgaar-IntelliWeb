import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { startConversation } from "@/lib/chat/conversations";
import { createOffer, offersFor, respondToOffer } from "@/lib/chat/offers";
import { messagesAfter } from "@/lib/chat/messages";
import { db, getSqlClient } from "@/lib/db/client";
import { areas, requests, users } from "@/lib/db/schema";
import { saveWorkerProfile } from "@/lib/worker/profile";

afterAll(async () => {
  await getSqlClient().end();
});

const WHEN = "2030-01-07T05:00:00.000Z"; // Monday 10:00 Karachi, inside the worker's morning slot

async function setup() {
  await db
    .insert(areas)
    .values({
      slug: "offer-near",
      nameEn: "o",
      nameUr: "o",
      city: "islamabad",
      lat: 33.7,
      lng: 73.0,
    })
    .onConflictDoNothing();
  const s = randomUUID().slice(0, 8);
  let n = 0;
  const mk = async (role: "customer" | "worker") =>
    (
      await db
        .insert(users)
        .values({ name: `${role} ${s}`, email: `o-${role}-${s}-${n++}@example.com`, role })
        .returning()
    )[0]!;
  const [customer, worker, stranger] = [
    await mk("customer"),
    await mk("worker"),
    await mk("customer"),
  ];
  await saveWorkerProfile(worker.id, {
    trade: "mechanic",
    yearsExperience: 3,
    areaSlugs: ["offer-near"],
    indicativeRatePkr: 900,
    rateBasis: "per_visit",
    weekdays: [1],
    dayParts: ["morning"],
    photoMediaId: null,
  });
  const [req] = await db
    .insert(requests)
    .values({
      customerId: customer.id,
      trade: "mechanic",
      source: "tap",
      lat: 33.7,
      lng: 73.0,
      areaSlug: "offer-near",
      startAt: new Date(WHEN),
      durationMin: 60,
      urgency: "scheduled",
    })
    .returning();
  const { id } = await startConversation(customer.id, req!.id, worker.id);
  return { customer, worker, stranger, conversationId: id, requestId: req!.id };
}

const body = (over: Partial<Parameters<typeof createOffer>[2]> = {}) => ({
  clientMsgId: randomUUID(),
  pricePkr: 1500,
  startAt: WHEN,
  durationMin: 60,
  ...over,
});

describe("offers", () => {
  it("creates an offer message; a retry with the same client id returns the same offer", async () => {
    const { worker, conversationId } = await setup();
    const b = body();
    const a1 = await createOffer(conversationId, worker.id, b);
    const a2 = await createOffer(conversationId, worker.id, b);
    expect(a1.duplicate).toBe(false);
    expect(a2.duplicate).toBe(true);
    expect(a2.offer.id).toBe(a1.offer.id);
    expect(await offersFor(conversationId)).toHaveLength(1);
    const msgs = await messagesAfter(conversationId, 0);
    expect(msgs.filter((m) => m.kind === "offer")).toHaveLength(1);
  });

  it("strangers cannot offer; the conversation looks like it does not exist", async () => {
    const { stranger, conversationId } = await setup();
    await expect(createOffer(conversationId, stranger.id, body())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a start time in the past", async () => {
    const { worker, conversationId } = await setup();
    await expect(
      createOffer(conversationId, worker.id, body({ startAt: "2020-01-01T00:00:00.000Z" })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("a counter marks the old offer countered; a person keeps at most one pending offer", async () => {
    const { customer, worker, conversationId } = await setup();
    const first = await createOffer(conversationId, worker.id, body({ pricePkr: 2000 }));
    const counter = await createOffer(
      conversationId,
      customer.id,
      body({ pricePkr: 1500, counterOfOfferId: first.offer.id }),
    );
    let all = Object.fromEntries((await offersFor(conversationId)).map((o) => [o.id, o.status]));
    expect(all[first.offer.id]).toBe("countered");
    expect(all[counter.offer.id]).toBe("pending");
    // The worker counters back; the customer's offer is countered and theirs is the only pending one.
    const back = await createOffer(
      conversationId,
      worker.id,
      body({ pricePkr: 1800, counterOfOfferId: counter.offer.id }),
    );
    all = Object.fromEntries((await offersFor(conversationId)).map((o) => [o.id, o.status]));
    expect(all[counter.offer.id]).toBe("countered");
    expect(all[back.offer.id]).toBe("pending");
    // A second plain offer from the worker withdraws their previous pending one.
    const again = await createOffer(conversationId, worker.id, body({ pricePkr: 1700 }));
    all = Object.fromEntries((await offersFor(conversationId)).map((o) => [o.id, o.status]));
    expect(all[back.offer.id]).toBe("withdrawn");
    expect(all[again.offer.id]).toBe("pending");
  });

  it("refuses to counter your own offer, a non-pending offer, or another conversation's offer", async () => {
    const a = await setup();
    const b = await setup();
    const mine = await createOffer(a.conversationId, a.worker.id, body());
    await expect(
      createOffer(a.conversationId, a.worker.id, body({ counterOfOfferId: mine.offer.id })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await respondToOffer(mine.offer.id, a.customer.id, "decline");
    await expect(
      createOffer(a.conversationId, a.customer.id, body({ counterOfOfferId: mine.offer.id })),
    ).rejects.toMatchObject({ code: "CONFLICT_STATE" });
    // An offer id from a different conversation is NOT_FOUND, never a hint that it exists.
    const foreign = await createOffer(b.conversationId, b.worker.id, body());
    await expect(
      createOffer(a.conversationId, a.customer.id, body({ counterOfOfferId: foreign.offer.id })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("decline is for the other person, withdraw for the proposer, and only while pending", async () => {
    const { customer, worker, stranger, conversationId } = await setup();
    const o = await createOffer(conversationId, worker.id, body());
    await expect(respondToOffer(o.offer.id, worker.id, "decline")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(respondToOffer(o.offer.id, customer.id, "withdraw")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(respondToOffer(o.offer.id, stranger.id, "decline")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await respondToOffer(o.offer.id, customer.id, "decline")).status).toBe("declined");
    await expect(respondToOffer(o.offer.id, worker.id, "withdraw")).rejects.toMatchObject({
      code: "CONFLICT_STATE",
    });
    const o2 = await createOffer(conversationId, worker.id, body());
    expect((await respondToOffer(o2.offer.id, worker.id, "withdraw")).status).toBe("withdrawn");
  });
});
