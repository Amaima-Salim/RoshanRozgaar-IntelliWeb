import "server-only";
import { z } from "zod";
import { HttpError } from "./respond";

const keySchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Commit routes require an `Idempotency-Key` header (docs/02 §4, §7). */
export function requireIdempotencyKey(request: Request): string {
  const parsed = keySchema.safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success) throw new HttpError("VALIDATION", { reason: "idempotency_key" });
  return parsed.data;
}
