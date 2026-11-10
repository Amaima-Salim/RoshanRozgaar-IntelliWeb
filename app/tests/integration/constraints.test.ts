import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, getSqlClient } from "@/lib/db/client";
import { jobs, payments } from "@/lib/db/schema";
import { hours, makeBookingContext, pgCode } from "../support/factories";

const T0 = new Date("2026-12-01T05:00:00Z"); // 10:00 Asia/Karachi

afterAll(async () => {
  await getSqlClient().end();
});

describe("jobs_no_overlap (BR-P4, PRD-O4)", () => {
  it("rejects a second confirmed job overlapping the same worker's window with 23P01", async () => {
    const { insertJob } = await makeBookingContext(db);
    await insertJob(T0, hours(T0, 2));
    const err = await insertJob(hours(T0, 1), hours(T0, 3)).catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23P01");
  });

  it("rejects overlap against an in_progress job too", async () => {
    const { insertJob } = await makeBookingContext(db);
    await insertJob(T0, hours(T0, 2), "in_progress");
    const err = await insertJob(hours(T0, 1.5), hours(T0, 2.5)).catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23P01");
  });

  it("allows back-to-back (adjacent) jobs", async () => {
    const { insertJob } = await makeBookingContext(db);
    await insertJob(T0, hours(T0, 2));
    await expect(insertJob(hours(T0, 2), hours(T0, 4))).resolves.toBeDefined();
  });

  it("allows overlap with cancelled or completed jobs (they don't hold the window)", async () => {
    const { insertJob } = await makeBookingContext(db);
    await insertJob(T0, hours(T0, 2), "cancelled");
    await insertJob(T0, hours(T0, 2), "completed");
    await expect(insertJob(T0, hours(T0, 2))).resolves.toBeDefined();
  });

  it("allows different workers to share a window", async () => {
    const a = await makeBookingContext(db);
    const b = await makeBookingContext(db);
    await a.insertJob(T0, hours(T0, 2));
    await expect(b.insertJob(T0, hours(T0, 2))).resolves.toBeDefined();
  });

  it("re-confirming a cancelled job into an overlapping window is rejected", async () => {
    const { insertJob } = await makeBookingContext(db);
    const cancelled = await insertJob(T0, hours(T0, 2), "cancelled");
    await insertJob(T0, hours(T0, 2));
    const err = await db
      .update(jobs)
      .set({ status: "confirmed" })
      .where(eq(jobs.id, cancelled.id))
      .catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23P01");
  });

  it("is enforced for raw SQL, not just the ORM", async () => {
    const { insertJob, worker } = await makeBookingContext(db);
    await insertJob(T0, hours(T0, 2));
    // Borrow request/conversation/offer ids from a cancelled job so only the overlap rule can fire.
    const donor = await insertJob(hours(T0, 10), hours(T0, 12), "cancelled");
    const err = await db
      .execute(
        sql`insert into jobs (request_id, conversation_id, offer_id, customer_id, worker_id, price_pkr, start_at, end_at, status)
            select request_id, conversation_id, offer_id, customer_id, ${worker.id}, 1000,
                   ${hours(T0, 0.5).toISOString()}::timestamptz, ${hours(T0, 1).toISOString()}::timestamptz, 'confirmed'
            from jobs where id = ${donor.id}`,
      )
      .catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23P01");
  });

  it("rejects end_at <= start_at (jobs_time_order)", async () => {
    const { insertJob } = await makeBookingContext(db);
    const err = await insertJob(T0, T0).catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23514");
  });
});

describe("payments indexes (docs/06 §4)", () => {
  const newPayment = (
    jobId: string,
    customerId: string,
    status: "pending" | "succeeded" | "cash_confirmed" | "failed",
  ) =>
    db.insert(payments).values({
      jobId,
      customerId,
      provider: "mock",
      mode: "mock",
      amountPkr: 1500,
      txnRef: `T${Math.random().toString(36).slice(2)}`,
      status,
    });

  it("rejects a second pending payment for the same job", async () => {
    const { insertJob, customer } = await makeBookingContext(db);
    const job = await insertJob(T0, hours(T0, 2), "completed");
    await newPayment(job.id, customer.id, "pending");
    const err = await newPayment(job.id, customer.id, "pending").catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23505");
  });

  it("rejects a second successful payment (succeeded or cash_confirmed) for the same job", async () => {
    const { insertJob, customer } = await makeBookingContext(db);
    const job = await insertJob(T0, hours(T0, 2), "completed");
    await newPayment(job.id, customer.id, "succeeded");
    const err = await newPayment(job.id, customer.id, "cash_confirmed").catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23505");
  });

  it("allows retries after failures", async () => {
    const { insertJob, customer } = await makeBookingContext(db);
    const job = await insertJob(T0, hours(T0, 2), "completed");
    await newPayment(job.id, customer.id, "failed");
    await newPayment(job.id, customer.id, "failed");
    await expect(newPayment(job.id, customer.id, "pending")).resolves.toBeDefined();
  });

  it("rejects a non-positive amount", async () => {
    const { insertJob, customer } = await makeBookingContext(db);
    const job = await insertJob(T0, hours(T0, 2), "completed");
    const err = await db
      .insert(payments)
      .values({
        jobId: job.id,
        customerId: customer.id,
        provider: "mock",
        mode: "mock",
        amountPkr: 0,
        txnRef: "zero",
      })
      .catch((e: unknown) => e);
    expect(pgCode(err)).toBe("23514");
  });
});
