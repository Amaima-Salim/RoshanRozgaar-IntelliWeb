import { z } from "zod";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { respondToOffer } from "@/lib/chat/offers";

type Ctx = { params: Promise<{ id: string }> };

/** The proposer withdraws their own pending offer. */
export const POST = route<Ctx>("offers.withdraw", async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  return ok({ offer: await respondToOffer(id, user.id, "withdraw") });
});
