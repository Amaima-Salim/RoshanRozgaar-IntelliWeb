import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api/respond";
import { acceptOffer } from "@/lib/booking/accept";
import { cancelRequest } from "@/lib/booking/cancel-request";
import { expireStale } from "@/lib/booking/expiry";
import { loadJobView } from "@/lib/booking/job-view";
import { transitionJob } from "@/lib/booking/transitions";
import { db, getSqlClient } from "@/lib/db/client";
import {
  conversations,
  idempotencyKeys,
  jobEvents,
  jobs,
  messages,
  offers,
  requests,
} from "@/lib/db/schema";
import { findCandidates } from "@/lib/discovery/candidates";
import {
  MONDAY_10,
  addMin,
  addSiblingOffer,
  ensureArea,
  makeCustomer,
  makeOffer,
  makeWorker,
} from "../support/booking-factory";
import { pgCode } from "../support/factories";

afterAll(async () => {
  await getSqlClient().end();
});
beforeAll(async () => {
  await ensureArea();
});

const key = () => `k-${randomUUID()}`;
const code = (e: unknown) =>
  e instanceof HttpError
    ? e.code
    : `not-http pg=${pgCode(e)} ${(e as { cause?: Error }).cause?.message}`;
const detail = (e: unknown) =>
  e instanceof HttpError ? (e.details as Record<string, unknown>) : {};
const fails = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

const jobsFor = (workerId: string) => db.select().from(jobs).where(eq(jobs.workerId, workerId));

describe("acceptOffer: the booking (O4)", () => {
  it("creates one confirmed job and updates offer, request, conversation and the event log", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer, request, conversation } = await makeOffer({
      customerId: customer,
      workerId: worker,
      pricePkr: 1750,
    });
    const { job, replayed } = await acceptOffer(offer.id, customer, key());

    expect(replayed).toBe(false);
    expect(job).toMatchObject({
      status: "confirmed",
      pricePkr: 1750,
      version: 1,
      workerId: worker,
    });
    const [o] = await db.select().from(offers).where(eq(offers.id, offer.id));
    const [r] = await db.select().from(requests).where(eq(requests.id, request.id));
    const [c] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect([o!.status, r!.status, c!.status]).toEqual(["accepted", "booked", "booked"]);
    const events = await db.select().from(jobEvents).where(eq(jobEvents.jobId, job.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: null, toStatus: "confirmed", actorId: customer });
  });

  it("works the other way round: the worker accepts the customer's offer", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({
      customerId: customer,
      workerId: worker,
      proposer: "customer",
    });
    const { job } = await acceptOffer(offer.id, worker, key());
    expect(job.status).toBe("confirmed");
  });

  it("books without any payment row (booking never waits for payment)", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const { job } = await acceptOffer(offer.id, customer, key());
    const rows =
      await getSqlClient()`select count(*)::int as n from payments where job_id = ${job.id}`;
    expect(rows[0]!.n).toBe(0);
  });

  it("replaying the same Idempotency-Key returns the same job and creates nothing new", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const k = key();
    const first = await acceptOffer(offer.id, customer, k);
    const second = await acceptOffer(offer.id, customer, k);
    expect(second.replayed).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(await jobsFor(worker)).toHaveLength(1);
    const stored = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, customer));
    expect(stored).toHaveLength(1);
  });

  it("concurrent replays of the same key all resolve to the one job", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => acceptOffer(offer.id, customer, k)),
    );
    expect(new Set(results.map((r) => r.job.id)).size).toBe(1);
    expect(await jobsFor(worker)).toHaveLength(1);
  });

  it("the same customer tapping twice with different keys gets one job and a state conflict", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const settled = await Promise.allSettled([
      acceptOffer(offer.id, customer, key()),
      acceptOffer(offer.id, customer, key()),
    ]);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((s) => s.status === "rejected") as PromiseRejectedResult;
    expect(code(rejected.reason)).toBe("CONFLICT_STATE");
    expect(await jobsFor(worker)).toHaveLength(1);
  });

  it("50 rounds of two customers racing for the same worker and time → exactly one job each round", async () => {
    for (let i = 0; i < 50; i++) {
      const worker = await makeWorker();
      const [a, b] = [await makeCustomer(), await makeCustomer()];
      const oa = await makeOffer({ customerId: a, workerId: worker });
      const ob = await makeOffer({ customerId: b, workerId: worker });
      const settled = await Promise.allSettled([
        acceptOffer(oa.offer.id, a, key()),
        acceptOffer(ob.offer.id, b, key()),
      ]);
      const won = settled.filter((s) => s.status === "fulfilled");
      const lost = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
      expect(won, `round ${i}`).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(code(lost[0]!.reason)).toBe("CONFLICT_BOOKED");
      expect(await jobsFor(worker)).toHaveLength(1);
      // The loser's offer and request were not touched: nothing confirmed.
      const loserOffer = won.length && settled[0]!.status === "rejected" ? oa : ob;
      const [o] = await db.select().from(offers).where(eq(offers.id, loserOffer.offer.id));
      const [r] = await db.select().from(requests).where(eq(requests.id, loserOffer.request.id));
      expect([o!.status, r!.status]).toEqual(["pending", "open"]);
    }
  });

  it("a partially overlapping window also conflicts, and the loser gets alternatives (customer)", async () => {
    const worker = await makeWorker();
    const spare = await makeWorker("bk-area", { rate: 900 });
    const [a, b] = [await makeCustomer(), await makeCustomer()];
    const oa = await makeOffer({ customerId: a, workerId: worker, durationMin: 60 });
    const ob = await makeOffer({
      customerId: b,
      workerId: worker,
      startAt: addMin(MONDAY_10, 30),
      durationMin: 60,
    });
    await acceptOffer(oa.offer.id, a, key());
    const err = await fails(acceptOffer(ob.offer.id, b, key()));
    expect(code(err)).toBe("CONFLICT_BOOKED");
    const alts = detail(err).alternatives as Array<{ workerId: string }>;
    expect(alts.map((x) => x.workerId)).toContain(spare);
    expect(alts.map((x) => x.workerId)).not.toContain(worker);
  });

  it("back-to-back (adjacent) windows are both bookable", async () => {
    const worker = await makeWorker();
    const [a, b] = [await makeCustomer(), await makeCustomer()];
    const oa = await makeOffer({ customerId: a, workerId: worker, durationMin: 60 });
    const ob = await makeOffer({
      customerId: b,
      workerId: worker,
      startAt: addMin(MONDAY_10, 60),
      durationMin: 60,
    });
    await acceptOffer(oa.offer.id, a, key());
    await expect(acceptOffer(ob.offer.id, b, key())).resolves.toMatchObject({ replayed: false });
    expect(await jobsFor(worker)).toHaveLength(2);
  });

  it("closes the customer's other offers and conversations on the same request", async () => {
    const w1 = await makeWorker();
    const w2 = await makeWorker();
    const customer = await makeCustomer();
    const first = await makeOffer({ customerId: customer, workerId: w1 });
    const second = await addSiblingOffer(first.request.id, customer, w2);
    await acceptOffer(first.offer.id, customer, key());
    const [o2] = await db.select().from(offers).where(eq(offers.id, second.offer.id));
    const [c2] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, second.conversation.id));
    expect(o2!.status).toBe("withdrawn");
    expect(c2!.status).toBe("declined");
    // …and the second can no longer be accepted.
    expect(code(await fails(acceptOffer(second.offer.id, customer, key())))).toBe("CONFLICT_STATE");
    expect(await jobsFor(w2)).toHaveLength(0);
  });

  it.each(["withdrawn", "declined", "countered", "expired"] as const)(
    "accepting a %s offer is rejected with CONFLICT_STATE and books nothing",
    async (status) => {
      const worker = await makeWorker();
      const customer = await makeCustomer();
      const { offer } = await makeOffer({ customerId: customer, workerId: worker });
      await db.update(offers).set({ status }).where(eq(offers.id, offer.id));
      const err = await fails(acceptOffer(offer.id, customer, key()));
      expect(code(err)).toBe("CONFLICT_STATE");
      expect(detail(err).reason).toBe(`offer_${status}`);
      expect(await jobsFor(worker)).toHaveLength(0);
    },
  );

  it("accepting after the offer outlived OFFER_TTL_HOURS is rejected as expired", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const later = new Date(Date.now() + 30 * 3_600_000);
    const err = await fails(acceptOffer(offer.id, customer, key(), later));
    expect(code(err)).toBe("CONFLICT_STATE");
    const [o] = await db.select().from(offers).where(eq(offers.id, offer.id));
    expect(o!.status).toBe("expired");
  });

  it("rejects an offer whose time has already passed", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const past = new Date(Date.now() - 6 * 3_600_000);
    const { offer } = await makeOffer({ customerId: customer, workerId: worker, startAt: past });
    const err = await fails(acceptOffer(offer.id, customer, key()));
    expect(code(err)).toBe("CONFLICT_STATE");
    expect(detail(err).reason).toBe("offer_time_passed");
  });

  it("rejects the proposer (FORBIDDEN) and strangers (NOT_FOUND, no existence leak)", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const stranger = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    expect(code(await fails(acceptOffer(offer.id, worker, key())))).toBe("FORBIDDEN");
    expect(code(await fails(acceptOffer(offer.id, stranger, key())))).toBe("NOT_FOUND");
    expect(code(await fails(acceptOffer(randomUUID(), customer, key())))).toBe("NOT_FOUND");
    expect(await jobsFor(worker)).toHaveLength(0);
  });

  it("rejects when the worker is outside their weekly hours (re-check, not just the constraint)", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    // Monday 22:00 is not a "morning" window.
    const { offer } = await makeOffer({
      customerId: customer,
      workerId: worker,
      startAt: new Date("2030-01-07T17:00:00Z"),
    });
    const err = await fails(acceptOffer(offer.id, customer, key()));
    expect(code(err)).toBe("CONFLICT_STATE");
    expect(detail(err).reason).toBe("worker_outside_hours");
  });

  it("the database alone rejects an overlapping raw INSERT, whatever the app does (23P01)", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const first = await makeOffer({ customerId: customer, workerId: worker });
    const { job } = await acceptOffer(first.offer.id, customer, key());
    const other = await makeOffer({ customerId: await makeCustomer(), workerId: worker });
    const sql = getSqlClient();
    const err = await sql`
      insert into jobs (request_id, conversation_id, offer_id, customer_id, worker_id, price_pkr, start_at, end_at, status)
      values (${other.request.id}, ${other.conversation.id}, ${other.offer.id}, ${other.request.customerId}, ${worker},
              1000, ${job.startAt}, ${job.endAt}, 'confirmed')`.then(
      () => null,
      (e: unknown) => e,
    );
    expect(pgCode(err)).toBe("23P01");
  });
});

describe("job transitions (O4)", () => {
  async function booked() {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const { job } = await acceptOffer(offer.id, customer, key());
    return { worker, customer, job };
  }

  it("runs the full lifecycle with an event for every change", async () => {
    const { worker, customer, job } = await booked();
    const started = await transitionJob(job.id, worker, { action: "start", version: 1 });
    expect([started.status, started.version]).toEqual(["in_progress", 2]);
    const requested = await transitionJob(job.id, worker, {
      action: "request-complete",
      version: 2,
    });
    expect([requested.status, requested.version]).toEqual(["in_progress", 3]);
    const done = await transitionJob(job.id, customer, { action: "confirm-complete", version: 3 });
    expect([done.status, done.version]).toEqual(["completed", 4]);
    const events = await db.select().from(jobEvents).where(eq(jobEvents.jobId, job.id));
    expect(events.map((e) => e.toStatus).sort()).toEqual(
      ["completed", "confirmed", "in_progress", "in_progress"].sort(),
    );
    expect(done.completedAt).not.toBeNull();
  });

  it("is authorised by role: wrong role FORBIDDEN, strangers NOT_FOUND", async () => {
    const { worker, customer, job } = await booked();
    const stranger = await makeCustomer();
    expect(
      code(await fails(transitionJob(job.id, customer, { action: "start", version: 1 }))),
    ).toBe("FORBIDDEN");
    await transitionJob(job.id, worker, { action: "start", version: 1 });
    expect(
      code(
        await fails(transitionJob(job.id, customer, { action: "request-complete", version: 2 })),
      ),
    ).toBe("FORBIDDEN");
    await transitionJob(job.id, worker, { action: "request-complete", version: 2 });
    expect(
      code(await fails(transitionJob(job.id, worker, { action: "confirm-complete", version: 3 }))),
    ).toBe("FORBIDDEN");
    expect(
      code(
        await fails(transitionJob(job.id, stranger, { action: "cancel", version: 3, reason: "x" })),
      ),
    ).toBe("NOT_FOUND");
  });

  it("customer cannot confirm completion before the worker requests it", async () => {
    const { worker, customer, job } = await booked();
    await transitionJob(job.id, worker, { action: "start", version: 1 });
    const err = await fails(
      transitionJob(job.id, customer, { action: "confirm-complete", version: 2 }),
    );
    expect(code(err)).toBe("CONFLICT_STATE");
    expect(detail(err).reason).toBe("completion_not_requested");
  });

  it("cancel needs a reason, frees the window and reopens or cancels the request by who cancelled", async () => {
    const a = await booked();
    expect(
      code(await fails(transitionJob(a.job.id, a.customer, { action: "cancel", version: 1 }))),
    ).toBe("VALIDATION");
    const byCustomer = await transitionJob(a.job.id, a.customer, {
      action: "cancel",
      version: 1,
      reason: "no longer needed",
    });
    expect(byCustomer).toMatchObject({
      status: "cancelled",
      cancelReason: "no longer needed",
      cancelledBy: a.customer,
    });
    const [r1] = await db.select().from(requests).where(eq(requests.id, a.job.requestId));
    expect(r1!.status).toBe("cancelled");

    const b = await booked();
    await transitionJob(b.job.id, b.worker, { action: "cancel", version: 1, reason: "ill" });
    const [r2] = await db.select().from(requests).where(eq(requests.id, b.job.requestId));
    expect(r2!.status).toBe("open");
  });

  it("terminal states are final and cancelling an in-progress job is refused", async () => {
    const { worker, customer, job } = await booked();
    await transitionJob(job.id, worker, { action: "start", version: 1 });
    expect(
      code(
        await fails(transitionJob(job.id, customer, { action: "cancel", version: 2, reason: "x" })),
      ),
    ).toBe("CONFLICT_STATE");
    const c = await booked();
    await transitionJob(c.job.id, c.customer, { action: "cancel", version: 1, reason: "x" });
    const err = await fails(transitionJob(c.job.id, c.worker, { action: "start", version: 2 }));
    expect(code(err)).toBe("CONFLICT_STATE");
    expect(detail(err).reason).toBe("terminal_state");
  });

  it("a stale version is refused with the current row", async () => {
    const { worker, job } = await booked();
    await transitionJob(job.id, worker, { action: "start", version: 1 });
    const err = await fails(
      transitionJob(job.id, worker, { action: "request-complete", version: 1 }),
    );
    expect(code(err)).toBe("CONFLICT_STATE");
    expect(err instanceof HttpError && err.current).toMatchObject({
      version: 2,
      status: "in_progress",
    });
  });

  it("start vs cancel racing on the same version: exactly one wins, state and events agree", async () => {
    for (let i = 0; i < 20; i++) {
      const { worker, customer, job } = await booked();
      const settled = await Promise.allSettled([
        transitionJob(job.id, worker, { action: "start", version: 1 }),
        transitionJob(job.id, customer, { action: "cancel", version: 1, reason: "race" }),
      ]);
      expect(
        settled.filter((s) => s.status === "fulfilled"),
        `round ${i}`,
      ).toHaveLength(1);
      const [final] = await db.select().from(jobs).where(eq(jobs.id, job.id));
      expect(final!.version).toBe(2);
      expect(["in_progress", "cancelled"]).toContain(final!.status);
      const events = await db.select().from(jobEvents).where(eq(jobEvents.jobId, job.id));
      expect(events).toHaveLength(2);
      expect(events.some((e) => e.toStatus === final!.status)).toBe(true);
    }
  });

  it("the job view reveals the exact address to the worker only, and hides it from the customer's view of others", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const stranger = await makeCustomer();
    const { offer } = await makeOffer({
      customerId: customer,
      workerId: worker,
      addressText: "House 7, Street 9",
    });
    const { job } = await acceptOffer(offer.id, customer, key());
    expect((await loadJobView(job.id, worker)).addressText).toBe("House 7, Street 9");
    expect((await loadJobView(job.id, customer)).addressText).toBeNull();
    expect(code(await fails(loadJobView(job.id, stranger)))).toBe("NOT_FOUND");
  });
});

describe("availability effects (O4)", () => {
  const window = {
    trade: "plumber" as const,
    lat: 33.7,
    lng: 73.0,
    startAt: MONDAY_10,
    durationMin: 60,
    budgetPkr: null,
  };
  const ids = async () => (await findCandidates(window)).candidates.map((c) => c.workerId);

  it("an engaged worker disappears from overlapping searches; a cancellation brings them back", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    expect(await ids()).toContain(worker);
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const { job } = await acceptOffer(offer.id, customer, key());
    expect(await ids()).not.toContain(worker);

    // Not hidden for a window that does not overlap (adjacent).
    const adjacent = await findCandidates({ ...window, startAt: addMin(MONDAY_10, 60) });
    expect(adjacent.candidates.map((c) => c.workerId)).toContain(worker);

    await transitionJob(job.id, customer, {
      action: "cancel",
      version: 1,
      reason: "changed plans",
    });
    expect(await ids()).toContain(worker);
  });

  it("a completed job no longer holds the window", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer } = await makeOffer({ customerId: customer, workerId: worker });
    const { job } = await acceptOffer(offer.id, customer, key());
    await transitionJob(job.id, worker, { action: "start", version: 1 });
    await transitionJob(job.id, worker, { action: "request-complete", version: 2 });
    await transitionJob(job.id, customer, { action: "confirm-complete", version: 3 });
    expect(await ids()).toContain(worker);
  });
});

describe("lazy expiry (O4)", () => {
  it("expires offers and quiet requests after the TTL, but not requests with recent chat", async () => {
    const customer = await makeCustomer();
    const quiet = await makeOffer({ customerId: customer, workerId: await makeWorker() });
    const chatty = await makeOffer({ customerId: customer, workerId: await makeWorker() });
    const later = new Date(Date.now() + 30 * 3_600_000);
    // Fresh activity (relative to `later`) on the chatty one only.
    await db.insert(messages).values({
      conversationId: chatty.conversation.id,
      senderId: customer,
      kind: "text",
      bodyText: "hello",
      clientMsgId: `m-${randomUUID()}`,
      createdAt: new Date(later.getTime() - 3_600_000),
    });
    await db
      .update(offers)
      .set({ createdAt: new Date(later.getTime() - 3_600_000) })
      .where(eq(offers.id, chatty.offer.id));

    await expireStale({ now: later });

    const status = async (id: string) =>
      (await db.select().from(requests).where(eq(requests.id, id)))[0]!.status;
    expect(await status(quiet.request.id)).toBe("expired");
    expect(await status(chatty.request.id)).toBe("open");
    const [qo] = await db.select().from(offers).where(eq(offers.id, quiet.offer.id));
    const [qc] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, quiet.conversation.id));
    expect([qo!.status, qc!.status]).toEqual(["expired", "closed"]);
    // Idempotent: a second sweep changes nothing.
    await expireStale({ now: later });
    expect(await status(quiet.request.id)).toBe("expired");
  });

  it("never expires a request that already has a booking", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer, request } = await makeOffer({ customerId: customer, workerId: worker });
    await acceptOffer(offer.id, customer, key());
    await expireStale({ now: new Date(Date.now() + 90 * 3_600_000) });
    const [r] = await db.select().from(requests).where(eq(requests.id, request.id));
    expect(r!.status).toBe("booked");
    const live = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.workerId, worker), eq(jobs.status, "confirmed")));
    expect(live).toHaveLength(1);
  });
});

describe("cancelling a request before any booking", () => {
  it("closes the request, its conversations and pending offers, so nothing can be accepted", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const { offer, request, conversation } = await makeOffer({
      customerId: customer,
      workerId: worker,
    });
    const res = await cancelRequest(request.id, customer, "plans_changed");
    expect(res.status).toBe("cancelled");
    const [o] = await db.select().from(offers).where(eq(offers.id, offer.id));
    const [c] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect([o!.status, c!.status]).toEqual(["withdrawn", "closed"]);
    expect(code(await fails(acceptOffer(offer.id, customer, key())))).toBe("CONFLICT_STATE");
    expect(await jobsFor(worker)).toHaveLength(0);
  });

  it("is owner-only, needs a reason, and refuses a request that is already booked", async () => {
    const worker = await makeWorker();
    const customer = await makeCustomer();
    const stranger = await makeCustomer();
    const { offer, request } = await makeOffer({ customerId: customer, workerId: worker });
    expect(code(await fails(cancelRequest(request.id, stranger, "x")))).toBe("NOT_FOUND");
    expect(code(await fails(cancelRequest(request.id, customer, "   ")))).toBe("VALIDATION");
    await acceptOffer(offer.id, customer, key());
    const err = await fails(cancelRequest(request.id, customer, "too late"));
    expect(code(err)).toBe("CONFLICT_STATE");
    expect(detail(err).reason).toBe("request_booked");
  });
});
