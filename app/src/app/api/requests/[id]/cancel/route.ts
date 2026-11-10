import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireRole } from "@/lib/auth/guards";
import { cancelRequest, cancelRequestBodySchema } from "@/lib/booking/cancel-request";

type Ctx = { params: Promise<{ id: string }> };

/** The customer cancels their own open request (before any booking). Reason required. */
export const POST = route<Ctx>("requests.cancel", async (request, ctx) => {
  const user = await requireRole("customer");
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const { reason } = await parseJson(request, cancelRequestBodySchema);
  await enforceLimit(`request-cancel:${user.id}`, 20, 60);
  return ok({ request: await cancelRequest(id, user.id, reason) });
});
