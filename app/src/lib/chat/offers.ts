import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { conversations, messages, offers } from "@/lib/db/schema";

export const MIN_PRICE_PKR = 100;
export const MAX_PRICE_PKR = 1_000_000;

export const offerBodySchema = z.strictObject({
  clientMsgId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  pricePkr: z.number().int().min(MIN_PRICE_PKR).max(MAX_PRICE_PKR),
  startAt: z.iso.datetime(),
  durationMin: z.number().int().min(15).max(720),
  /** Set when this offer answers an earlier one (a counter). */
  counterOfOfferId: z.uuid().optional(),
  /** The sender saw an AI draft and confirmed it (label only; never decides anything). */
  aiDrafted: z.boolean().optional(),
});

export type OfferView = {
  id: string;
  proposerId: string;
  pricePkr: number;
  startAt: string;
  durationMin: number;
  status: (typeof offers.$inferSelect)["status"];
};

export const toOfferView = (o: typeof offers.$inferSelect): OfferView => ({
  id: o.id,
  proposerId: o.proposerId,
  pricePkr: o.pricePkr,
  startAt: o.startAt.toISOString(),
  durationMin: o.durationMin,
  status: o.status,
});

/** Every offer in a conversation: small, and what makes status changes show up when polling. */
export async function offersFor(conversationId: string): Promise<OfferView[]> {
  const rows = await db.select().from(offers).where(eq(offers.conversationId, conversationId));
  return rows.map(toOfferView);
}

/**
 * Sends an offer (or a counter) into an open conversation. A counter may only answer a pending
 * offer from the other person, and marks it `countered` in the same transaction. A person never
 * has two pending offers at once: their older one is withdrawn, so "the current offer" is clear.
 * Retrying the same `clientMsgId` returns the stored result.
 */
export async function createOffer(
  conversationId: string,
  proposerId: string,
  body: z.infer<typeof offerBodySchema>,
  now: Date = new Date(),
): Promise<{ offer: OfferView; messageId: string; duplicate: boolean }> {
  const startAt = new Date(body.startAt);
  if (startAt.getTime() < now.getTime() - 5 * 60_000)
    throw new HttpError("VALIDATION", { reason: "start_in_past" });

  return db.transaction(async (tx) => {
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for("update");
    if (!conv || (conv.customerId !== proposerId && conv.workerId !== proposerId))
      throw new HttpError("NOT_FOUND");
    if (conv.status !== "open")
      throw new HttpError("CONFLICT_STATE", { reason: "conversation_closed" });

    const [dupe] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.clientMsgId, body.clientMsgId),
        ),
      );
    if (dupe?.offerId) {
      const [o] = await tx.select().from(offers).where(eq(offers.id, dupe.offerId));
      if (o) return { offer: toOfferView(o), messageId: dupe.id, duplicate: true };
    }

    if (body.counterOfOfferId) {
      const [prev] = await tx
        .select()
        .from(offers)
        .where(and(eq(offers.id, body.counterOfOfferId), eq(offers.conversationId, conversationId)))
        .for("update");
      // A foreign offer id (another conversation) is "not found", never a hint it exists.
      if (!prev) throw new HttpError("NOT_FOUND");
      if (prev.proposerId === proposerId) throw new HttpError("FORBIDDEN", { reason: "own_offer" });
      if (prev.status !== "pending")
        throw new HttpError("CONFLICT_STATE", { reason: `offer_${prev.status}` });
      await tx
        .update(offers)
        .set({ status: "countered", respondedAt: now })
        .where(eq(offers.id, prev.id));
    }

    await tx
      .update(offers)
      .set({ status: "withdrawn", respondedAt: now })
      .where(
        and(
          eq(offers.conversationId, conversationId),
          eq(offers.proposerId, proposerId),
          eq(offers.status, "pending"),
        ),
      );

    const [offer] = await tx
      .insert(offers)
      .values({
        conversationId,
        proposerId,
        pricePkr: body.pricePkr,
        startAt,
        durationMin: body.durationMin,
      })
      .returning();
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId: proposerId,
        kind: "offer",
        offerId: offer!.id,
        clientMsgId: body.clientMsgId,
        aiGenerated: body.aiDrafted ?? false,
      })
      .returning({ id: messages.id });
    await tx
      .update(conversations)
      .set({ updatedAt: sql`now()` })
      .where(inArray(conversations.id, [conversationId]));
    return { offer: toOfferView(offer!), messageId: message!.id, duplicate: false };
  });
}

/** Decline (the other person) or withdraw (the proposer). Only a pending offer can change. */
export async function respondToOffer(
  offerId: string,
  actorId: string,
  action: "decline" | "withdraw",
  now: Date = new Date(),
): Promise<OfferView> {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(offers).where(eq(offers.id, offerId)).for("update");
    if (!o) throw new HttpError("NOT_FOUND");
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, o.conversationId));
    if (!conv || (conv.customerId !== actorId && conv.workerId !== actorId))
      throw new HttpError("NOT_FOUND");
    const isProposer = o.proposerId === actorId;
    if (action === "withdraw" && !isProposer)
      throw new HttpError("FORBIDDEN", { reason: "not_proposer" });
    if (action === "decline" && isProposer)
      throw new HttpError("FORBIDDEN", { reason: "own_offer" });
    if (o.status !== "pending")
      throw new HttpError("CONFLICT_STATE", { reason: `offer_${o.status}` });
    const [updated] = await tx
      .update(offers)
      .set({ status: action === "decline" ? "declined" : "withdrawn", respondedAt: now })
      .where(eq(offers.id, offerId))
      .returning();
    return toOfferView(updated!);
  });
}
