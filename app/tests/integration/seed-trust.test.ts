import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, getSqlClient } from "@/lib/db/client";
import { reviews, users, workerReputation } from "@/lib/db/schema";
import { seed } from "@/lib/db/seed";
import { loadWorkerTrust } from "@/lib/trust/reputation";

afterAll(async () => {
  await getSqlClient().end();
});

const repOf = async (name: string) => {
  const [u] = await db.select().from(users).where(eq(users.name, name));
  const [r] = await db.select().from(workerReputation).where(eq(workerReputation.workerId, u!.id));
  return { id: u!.id, rep: r };
};

describe("seeded trust data", () => {
  it("has ~45 reviews, all seeded, idempotent, with the edge cases", async () => {
    const silence = console.log;
    console.log = () => undefined;
    try {
      await seed(db);
      await seed(db);
    } finally {
      console.log = silence;
    }
    // Other integration cases may already have created genuine reviews in this shared DB.
    const all = await db.select().from(reviews).where(eq(reviews.isSeeded, true));
    expect(all).toHaveLength(45);
    expect(all.every((r) => r.isSeeded)).toBe(true);
    expect(all.some((r) => r.commentText && r.aiFlagged === false)).toBe(true);

    // 1: excellent ratings. 5: mixed (punctual but pricey). 4: brand new → no reviews at all.
    const excellent = (await repOf("Imran Qureshi")).rep!;
    expect(excellent.avgStars!).toBeGreaterThan(4.5);
    const mixed = (await repOf("Farhan Saeed")).rep!;
    expect(mixed.avgStars!).toBeLessThan(4);
    const rates = mixed.signalRates as Record<string, { yes: number; total: number }>;
    expect(rates.onTime!.yes / rates.onTime!.total).toBeGreaterThan(0.8);
    expect(rates.fairPrice!.yes / rates.fairPrice!.total).toBeLessThan(0.3);
    const fresh = await loadWorkerTrust((await repOf("Usman Tariq")).id);
    expect(fresh.stats.reviewCount).toBe(0);
    expect(fresh.stats.avgStars).toBeNull();
    expect(fresh.template).toBeNull();
  });
});
