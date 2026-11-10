import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { createOffer, offerBodySchema } from "@/lib/chat/offers";

type Ctx = { params: Promise<{ id: string }> };

/** Send an offer, or a counter (`counterOfOfferId`). Participants only. A human always sends. */
export const POST = route<Ctx>("offers.create", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const body = await parseJson(request, offerBodySchema);
  await enforceLimit(`offer-create:${user.id}`, 20, 60);
  const { offer, duplicate } = await createOffer(id, user.id, body);
  return ok({ offer, duplicate }, { status: duplicate ? 200 : 201 });
});
