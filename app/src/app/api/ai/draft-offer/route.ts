import { eq } from "drizzle-orm";
import { z } from "zod";
import { draftOfferFromText } from "@/lib/ai/chat";
import { getConfig } from "@/lib/config";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceAiLimits } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { requireParticipant } from "@/lib/chat/conversations";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";

const bodySchema = z.strictObject({ messageId: z.uuid() });

/**
 * AI-05: propose an amount from what was said in a chat message. A draft only: the caller shows it
 * labelled "AI" and the person edits and presses Send themselves; this route never creates an offer.
 */
export const POST = route("ai.draft-offer", async (request) => {
  const user = await requireUser();
  const { mode } = getConfig().ai;
  if (mode === "off") throw new HttpError("AI_UNAVAILABLE", { reason: "off" });
  const { messageId } = await parseJson(request, bodySchema);
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!m) throw new HttpError("NOT_FOUND");
  await requireParticipant(m.conversationId, user.id); // strangers get NOT_FOUND
  await enforceAiLimits(user.id);
  const text = m.transcriptText ?? m.bodyText ?? "";
  const { pricePkr } = draftOfferFromText(text);
  return ok({ pricePkr, aiDrafted: true, simulated: mode === "fixtures" });
});
