import "server-only";
import { and, desc, eq, or } from "drizzle-orm";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { conversations, messages, requests, users, workerProfiles } from "@/lib/db/schema";
import { findCandidates } from "@/lib/discovery/candidates";

export type Participant = { conversationId: string; role: "customer" | "worker"; otherId: string };

/** Loads a conversation only for its two participants; anyone else gets NOT_FOUND (no existence leak). */
export async function requireParticipant(
  conversationId: string,
  userId: string,
): Promise<Participant & { requestId: string; status: string }> {
  const [c] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.customerId, userId), eq(conversations.workerId, userId)),
      ),
    );
  if (!c) throw new HttpError("NOT_FOUND");
  const role = c.customerId === userId ? "customer" : "worker";
  return {
    conversationId: c.id,
    role,
    otherId: role === "customer" ? c.workerId : c.customerId,
    requestId: c.requestId,
    status: c.status,
  };
}

/**
 * Starts (or returns) the one conversation for this request and worker. Only the request's owner
 * may start it, only while the request is open, and only with a worker who is actually eligible
 * for it (same rule as the results list), so chat cannot be used to reach arbitrary workers.
 */
export async function startConversation(
  customerId: string,
  requestId: string,
  workerId: string,
): Promise<{ id: string; created: boolean }> {
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.customerId, customerId)));
  if (!req) throw new HttpError("NOT_FOUND");
  if (req.status !== "open") throw new HttpError("CONFLICT_STATE", { reason: "request_closed" });

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.requestId, requestId), eq(conversations.workerId, workerId)));
  if (existing) return { id: existing.id, created: false };

  const found = await findCandidates(req);
  if (!found.candidates.some((c) => c.workerId === workerId))
    throw new HttpError("CONFLICT_STATE", { reason: "worker_not_eligible" });

  const [row] = await db
    .insert(conversations)
    .values({ requestId, customerId, workerId })
    .onConflictDoNothing()
    .returning({ id: conversations.id });
  if (row) return { id: row.id, created: true };
  // Lost a race with a parallel start: return the winner.
  const [again] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.requestId, requestId), eq(conversations.workerId, workerId)));
  if (!again) throw new HttpError("INTERNAL");
  return { id: again.id, created: false };
}

export type ConversationSummary = {
  id: string;
  status: string;
  trade: (typeof requests.$inferSelect)["trade"];
  startAt: Date;
  otherName: string;
  otherNameUr: string | null;
  lastText: string | null;
  lastKind: string | null;
  lastAt: Date | null;
};

/** Inbox for either role: the other party's name (never a phone number) and the last message. */
export async function listConversations(
  userId: string,
  role: "customer" | "worker",
): Promise<ConversationSummary[]> {
  const mine = role === "customer" ? conversations.customerId : conversations.workerId;
  const otherCol = role === "customer" ? conversations.workerId : conversations.customerId;
  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      trade: requests.trade,
      startAt: requests.startAt,
      otherName: users.name,
      otherNameUr: users.nameUr,
    })
    .from(conversations)
    .innerJoin(requests, eq(requests.id, conversations.requestId))
    .innerJoin(users, eq(users.id, otherCol))
    .where(eq(mine, userId))
    .orderBy(desc(conversations.createdAt));

  const out: ConversationSummary[] = [];
  for (const r of rows) {
    const [last] = await db
      .select({ text: messages.bodyText, kind: messages.kind, at: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, r.id))
      .orderBy(desc(messages.seq))
      .limit(1);
    out.push({
      ...r,
      lastText: last?.text ?? null,
      lastKind: last?.kind ?? null,
      lastAt: last?.at ?? null,
    });
  }
  out.sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
  return out;
}

/** Header facts for the chat screen: who, what trade, when. No contact details. */
export async function conversationHeader(conversationId: string, viewerId: string) {
  const p = await requireParticipant(conversationId, viewerId);
  const [other] = await db
    .select({ name: users.name, nameUr: users.nameUr })
    .from(users)
    .where(eq(users.id, p.otherId));
  const [req] = await db
    .select({
      trade: requests.trade,
      startAt: requests.startAt,
      durationMin: requests.durationMin,
      summaryText: requests.summaryText,
      budgetPkr: requests.budgetPkr,
    })
    .from(requests)
    .where(eq(requests.id, p.requestId));
  const [profile] =
    p.role === "customer"
      ? await db
          .select({
            rate: workerProfiles.indicativeRatePkr,
            basis: workerProfiles.rateBasis,
            years: workerProfiles.yearsExperience,
          })
          .from(workerProfiles)
          .where(eq(workerProfiles.userId, p.otherId))
      : [undefined];
  return { ...p, other, request: req!, workerProfile: profile ?? null };
}
