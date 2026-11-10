import { z } from "zod";
import { AiUnavailableError } from "@/lib/ai/errors";
import { draftReview } from "@/lib/ai/trust";
import { enforceLimit } from "@/lib/api/rate-limit";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { commentLooksUnsafe } from "@/lib/domain/trust";
import { requireReviewableJob } from "@/lib/trust/review";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.strictObject({ text: z.string().trim().min(1).max(1000) });

/**
 * AI-06: comment → tags + bilingual summary + flag, as a draft the customer confirms or edits.
 * Nothing is stored here. The final review route re-checks everything it is given.
 */
export const POST = route<Ctx>("jobs.review.draft", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  await requireReviewableJob(id, user.id);
  const { text } = await parseJson(request, bodySchema);
  await enforceLimit(`review-ai:${user.id}`, 20, 60);
  try {
    const { draft, simulated } = await draftReview(text);
    return ok({
      draft: { ...draft, flagged: draft.flagged || commentLooksUnsafe(text) },
      simulated,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError)
      throw new HttpError("AI_UNAVAILABLE", { reason: err.reason });
    throw err;
  }
});
