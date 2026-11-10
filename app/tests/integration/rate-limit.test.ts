import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { enforceLimit } from "@/lib/api/rate-limit";
import { HttpError } from "@/lib/api/respond";
import { db, getSqlClient } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

afterAll(async () => {
  await getSqlClient().end();
});

describe("enforceLimit (docs/04 §8)", () => {
  it("allows up to max calls in a window, then throws RATE_LIMITED", async () => {
    const key = `test-${randomUUID()}`;
    await enforceLimit(key, 2, 3600);
    await enforceLimit(key, 2, 3600);
    await expect(enforceLimit(key, 2, 3600)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(enforceLimit(key, 2, 3600)).rejects.toBeInstanceOf(HttpError);
    const rows = await db
      .select()
      .from(rateLimits)
      .where(like(rateLimits.key, `${key}%`));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(4);
  });

  it("keeps separate counters per key", async () => {
    const a = `test-${randomUUID()}`;
    const b = `test-${randomUUID()}`;
    await enforceLimit(a, 1, 3600);
    await expect(enforceLimit(b, 1, 3600)).resolves.toBeUndefined();
  });
});
