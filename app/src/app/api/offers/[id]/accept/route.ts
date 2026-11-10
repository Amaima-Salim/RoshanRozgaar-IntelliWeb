import { z } from "zod";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireIdempotencyKey } from "@/lib/api/idempotency";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { acceptOffer } from "@/lib/booking/accept";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Accepting an offer IS the booking (D-11). Requires an `Idempotency-Key`; a replay with the same
 * key returns the same job. 409 CONFLICT_BOOKED carries next-best alternatives (customers only).
 */
export const POST = route<Ctx>("offers.accept", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const key = requireIdempotencyKey(request);
  await enforceLimit(`accept:${user.id}`, 20, 60);
  const { job, replayed } = await acceptOffer(id, user.id, key);
  return ok({ job, replayed }, { status: replayed ? 200 : 201 });
});
