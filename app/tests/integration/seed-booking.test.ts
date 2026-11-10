import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, getSqlClient } from "@/lib/db/client";
import { jobs, users } from "@/lib/db/schema";
import { seed } from "@/lib/db/seed";

afterAll(async () => {
  await getSqlClient().end();
});

describe("seed edge case 3: a nearby worker who is really engaged", () => {
  it("has one real confirmed 2-hour job and re-seeding is idempotent", async () => {
    const silence = console.log;
    console.log = () => undefined;
    try {
      await seed(db);
      await seed(db); // re-running must not duplicate or violate the exclusion constraint
    } finally {
      console.log = silence;
    }

    const [worker] = await db.select().from(users).where(eq(users.name, "Naveed Akhtar"));
    const live = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workerId, worker!.id),
          inArray(jobs.status, ["confirmed", "in_progress"]),
          eq(jobs.isSeeded, true),
        ),
      );
    expect(live).toHaveLength(1);
    // The job holds a real 2-hour window starting now.
    const hours = (live[0]!.endAt.getTime() - live[0]!.startAt.getTime()) / 3_600_000;
    expect(hours).toBe(2);
  });
});
