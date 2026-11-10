import { after } from "next/server";
import { z } from "zod";
import { enforceLimit } from "@/lib/api/rate-limit";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { refreshTrustSummary } from "@/lib/trust/reputation";
import { reviewBodySchema, submitReview } from "@/lib/trust/review";

type Ctx = { params: Promise<{ id: string }> };

/** The customer of a completed job reviews it, once (BR-P6). Reputation updates in the same transaction. */
export const POST = route<Ctx>("jobs.review", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const body = await parseJson(request, reviewBodySchema);
  await enforceLimit(`review:${user.id}`, 10, 60);
  const review = await submitReview(id, user.id, body);
  // AI-07 phrasing runs after the commit and never blocks (or breaks) the review.
  after(() => refreshTrustSummary(review.workerId).catch(() => undefined));
  return ok({ review: { id: review.id } }, { status: 201 });
});
