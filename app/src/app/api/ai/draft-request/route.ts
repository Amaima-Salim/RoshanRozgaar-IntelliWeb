import { AiUnavailableError, draftRequest } from "@/lib/ai";
import { draftRequestBodySchema } from "@/lib/ai/schemas";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceAiLimits } from "@/lib/api/rate-limit";
import { requireRole } from "@/lib/auth/guards";
import { getConfig } from "@/lib/config";

/** A customer's description → a proposed trade and time. A draft only; the customer confirms (AI-03). */
export const POST = route("ai.draftRequest", async (request) => {
  const user = await requireRole("customer");
  if (getConfig().ai.mode === "off") throw new HttpError("AI_UNAVAILABLE", { reason: "off" });
  const { text } = await parseJson(request, draftRequestBodySchema);
  await enforceAiLimits(user.id);
  try {
    const { draft, source, simulated } = await draftRequest({ text });
    return ok({ draft, source, simulated });
  } catch (err) {
    if (err instanceof AiUnavailableError)
      throw new HttpError("AI_UNAVAILABLE", { reason: err.reason });
    throw err;
  }
});
