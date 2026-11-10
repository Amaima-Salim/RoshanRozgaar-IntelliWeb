import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { requireParticipant } from "@/lib/chat/conversations";
import { insertMessage, messagesAfter } from "@/lib/chat/messages";
import { offersFor } from "@/lib/chat/offers";
import { QUICK_KEYS, quickReplyText } from "@/lib/chat/quick-replies";

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.uuid();
const afterSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Poll: everything after `seq`. Participants only. */
export const GET = route<Ctx>("messages.list", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) throw new HttpError("NOT_FOUND");
  await requireParticipant(id, user.id);
  const raw = new URL(request.url).searchParams.get("after");
  const after = raw === null ? 0 : afterSchema.safeParse(raw);
  if (typeof after !== "number" && !after.success)
    throw new HttpError("VALIDATION", { reason: "after" });
  const messages = await messagesAfter(id, typeof after === "number" ? after : after.data);
  // Offers ride along so an accepted / countered / declined card updates without a reload.
  return ok({ messages, offers: await offersFor(id) });
});

const sendSchema = z
  .strictObject({
    clientMsgId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    kind: z.literal("text"),
    bodyText: z.string().trim().min(1).max(1000).optional(),
    quickReply: z.enum(QUICK_KEYS).optional(),
  })
  .refine((b) => (b.bodyText === undefined) !== (b.quickReply === undefined), {
    message: "exactly one of bodyText or quickReply",
  });

/** Send a text message (voice notes and offers have their own routes). Retries are deduplicated. */
export const POST = route<Ctx>("messages.send", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) throw new HttpError("NOT_FOUND");
  const p = await requireParticipant(id, user.id);
  if (!["open", "booked"].includes(p.status))
    throw new HttpError("CONFLICT_STATE", { reason: "conversation_closed" });
  const body = await parseJson(request, sendSchema);
  await enforceLimit(`chat-send:${user.id}`, 30, 60);
  const { message, duplicate } = await insertMessage({
    conversationId: id,
    senderId: user.id,
    kind: "text",
    clientMsgId: body.clientMsgId,
    ...(body.quickReply
      ? quickReplyText(body.quickReply, user.language)
      : { bodyText: body.bodyText! }),
  });
  return ok({ message, duplicate }, { status: duplicate ? 200 : 201 });
});
