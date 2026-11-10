import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/auth/guards";
import { expireStale } from "@/lib/booking/expiry";
import { db } from "@/lib/db/client";
import { areas, conversations, jobs, offers, requests, users } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";
import { AcceptPanel } from "./AcceptPanel";

/**
 * /c/offer/[id] and /w/offer/[id]: where an offer card's Accept button leads. The server
 * restates the stored terms (never anything the client sends), and an offer that can't be
 * accepted any more says why instead of offering a button that would fail.
 */
export async function OfferAcceptPage({
  role,
  offerId,
}: {
  role: "customer" | "worker";
  offerId: string;
}) {
  const user = await requireRolePage(role);
  if (!/^[0-9a-f-]{36}$/.test(offerId)) notFound();
  const { lang } = await getT();

  const [row] = await db
    .select({ offer: offers, conversation: conversations, request: requests })
    .from(offers)
    .innerJoin(conversations, eq(conversations.id, offers.conversationId))
    .innerJoin(requests, eq(requests.id, conversations.requestId))
    .where(eq(offers.id, offerId));
  if (!row) notFound();
  const { offer, conversation, request } = row;
  if (conversation.customerId !== user.id && conversation.workerId !== user.id) notFound();

  await expireStale({ requestId: request.id });
  const [fresh] = await db.select().from(offers).where(eq(offers.id, offerId));
  const [freshRequest] = await db.select().from(requests).where(eq(requests.id, request.id));
  const [booked] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.offerId, offerId));

  const otherId = role === "customer" ? conversation.workerId : conversation.customerId;
  const [other] = await db
    .select({ name: users.name, nameUr: users.nameUr })
    .from(users)
    .where(eq(users.id, otherId));
  const [area] = await db.select().from(areas).where(eq(areas.slug, request.areaSlug));

  let blockedReason: string | undefined;
  if (fresh?.proposerId === user.id) blockedReason = "own_offer";
  else if (fresh?.status !== "pending") blockedReason = `offer_${fresh?.status}`;
  else if (freshRequest?.status !== "open") blockedReason = `request_${freshRequest?.status}`;
  else if (conversation.status !== "open") blockedReason = `conversation_${conversation.status}`;
  if (booked) blockedReason = "offer_accepted";

  return (
    <AcceptPanel
      role={role}
      canAccept={!blockedReason}
      blockedReason={blockedReason}
      summary={{
        offerId: offer.id,
        otherName: other?.name ?? "",
        otherNameUr: other?.nameUr ?? null,
        trade: request.trade,
        pricePkr: offer.pricePkr,
        startAt: offer.startAt.toISOString(),
        durationMin: offer.durationMin,
        areaName: (lang === "ur" ? area?.nameUr : area?.nameEn) ?? request.areaSlug,
        requestId: request.id,
        conversationId: conversation.id,
      }}
    />
  );
}
