import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api/respond";
import { requireParticipant, startConversation } from "@/lib/chat/conversations";
import { insertMessage, messagesAfter } from "@/lib/chat/messages";
import { db, getSqlClient } from "@/lib/db/client";
import { areas, requests, users } from "@/lib/db/schema";
import { saveWorkerProfile } from "@/lib/worker/profile";

afterAll(async () => {
  await getSqlClient().end();
});

const MONDAY_10_PKT = new Date("2030-01-07T05:00:00Z");

async function setup() {
  await db
    .insert(areas)
    .values({
      slug: "chat-near",
      nameEn: "c",
      nameUr: "c",
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
        .values({ name: `${role} ${s}`, email: `${role}-${s}-${n++}@example.com`, role })
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
    areaSlugs: ["chat-near"],
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
      areaSlug: "chat-near",
      startAt: MONDAY_10_PKT,
      durationMin: 60,
      urgency: "scheduled",
    })
    .returning();
  return { customer, worker, stranger, req: req! };
}

describe("conversations", () => {
  it("starts once per (request, worker), and returns the same one afterwards", async () => {
    const { customer, worker, req } = await setup();
    const a = await startConversation(customer.id, req.id, worker.id);
    const b = await startConversation(customer.id, req.id, worker.id);
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it("refuses someone else's request, a worker who is not eligible, and a closed request", async () => {
    const { customer, worker, stranger, req } = await setup();
    await expect(startConversation(stranger.id, req.id, worker.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const other = await setup(); // a worker of another trade: not eligible for this request
    await saveWorkerProfile(other.worker.id, {
      trade: "plumber",
      yearsExperience: 3,
      areaSlugs: ["chat-near"],
      indicativeRatePkr: 900,
      rateBasis: "per_visit",
      weekdays: [1],
      dayParts: ["morning"],
      photoMediaId: null,
    });
    await expect(startConversation(customer.id, req.id, other.worker.id)).rejects.toMatchObject({
      code: "CONFLICT_STATE",
    });
    await db.update(requests).set({ status: "cancelled" }).where(eq(requests.id, req.id));
    await expect(startConversation(customer.id, req.id, worker.id)).rejects.toMatchObject({
      code: "CONFLICT_STATE",
    });
  });

  it("only the two participants can read it; others get NOT_FOUND", async () => {
    const { customer, worker, stranger, req } = await setup();
    const { id } = await startConversation(customer.id, req.id, worker.id);
    expect((await requireParticipant(id, customer.id)).role).toBe("customer");
    expect((await requireParticipant(id, worker.id)).role).toBe("worker");
    await expect(requireParticipant(id, stranger.id)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("messages", () => {
  it("are ordered by seq, and polling after=seq returns only newer ones", async () => {
    const { customer, worker, req } = await setup();
    const { id } = await startConversation(customer.id, req.id, worker.id);
    const send = (text: string, by = customer.id) =>
      insertMessage({
        conversationId: id,
        senderId: by,
        kind: "text",
        clientMsgId: randomUUID(),
        bodyText: text,
      });
    const m1 = await send("one");
    await send("two", worker.id);
    await send("three");
    const all = await messagesAfter(id, 0);
    expect(all.map((m) => m.bodyText)).toEqual(["one", "two", "three"]);
    const later = await messagesAfter(id, m1.message.seq);
    expect(later.map((m) => m.bodyText)).toEqual(["two", "three"]);
    expect(await messagesAfter(id, all.at(-1)!.seq)).toEqual([]);
  });

  it("a retried send with the same client id never duplicates", async () => {
    const { customer, worker, req } = await setup();
    const { id } = await startConversation(customer.id, req.id, worker.id);
    const clientMsgId = randomUUID();
    const input = { conversationId: id, senderId: customer.id, kind: "text" as const, clientMsgId };
    const first = await insertMessage({ ...input, bodyText: "hello" });
    const retry = await insertMessage({ ...input, bodyText: "hello" });
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(retry.message.id).toBe(first.message.id);
    expect(await messagesAfter(id, 0)).toHaveLength(1);
  });

  it("parallel sends with one client id still store exactly one", async () => {
    const { customer, worker, req } = await setup();
    const { id } = await startConversation(customer.id, req.id, worker.id);
    const clientMsgId = randomUUID();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        insertMessage({
          conversationId: id,
          senderId: customer.id,
          kind: "text",
          clientMsgId,
          bodyText: "x",
        }),
      ),
    );
    expect(await messagesAfter(id, 0)).toHaveLength(1);
  });
});
