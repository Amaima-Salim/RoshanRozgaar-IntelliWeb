import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";
import { getConfig } from "@/lib/config";
import { HttpError } from "./respond";

/**
 * Fixed-window counter in the DB, so limits hold across serverless instances (docs/04 §8).
 * Throws RATE_LIMITED when `key` has been used more than `max` times in the current window.
 */
export async function enforceLimit(key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const bucket = `${key}:${windowStart}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: bucket, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1`, lastRequest: now },
    })
    .returning({ count: rateLimits.count });
  if (!row || row.count > max) {
    throw new HttpError("RATE_LIMITED", {
      retryAfter: Math.ceil((windowStart + windowSeconds * 1000 - now) / 1000),
    });
  }
}

/** Burst and daily caps for `/api/ai/*` per signed-in user. */
export async function enforceAiLimits(userId: string) {
  // The local E2E server (RR_E2E=1, refused on any deployment) shares one demo account across
  // many runs, so counting would make later tests fail for reasons unrelated to the feature.
  if (getConfig().isE2E) return;
  await enforceLimit(`ai-burst:${userId}`, 30, 60);
  await enforceLimit(`ai-day:${userId}`, 200, 86_400);
}
