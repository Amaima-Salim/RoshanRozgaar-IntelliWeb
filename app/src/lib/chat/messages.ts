import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";

export type ChatMessage = {
  id: string;
  seq: number;
  senderId: string | null;
  kind: (typeof messages.$inferSelect)["kind"];
  bodyText: string | null;
  mediaId: string | null;
  transcriptText: string | null;
  transcriptLang: "ur" | "en" | null;
  translatedText: string | null;
  translatedLang: "ur" | "en" | null;
  aiGenerated: boolean;
  offerId: string | null;
  clientMsgId: string;
  createdAt: string;
};

const toChat = (m: typeof messages.$inferSelect): ChatMessage => ({
  id: m.id,
  seq: m.seq,
  senderId: m.senderId,
  kind: m.kind,
  bodyText: m.bodyText,
  mediaId: m.mediaId,
  transcriptText: m.transcriptText,
  transcriptLang: m.transcriptLang,
  translatedText: m.translatedText,
  translatedLang: m.translatedLang,
  aiGenerated: m.aiGenerated,
  offerId: m.offerId,
  clientMsgId: m.clientMsgId,
  createdAt: m.createdAt.toISOString(),
});

/** Messages with `seq > after`, oldest first. Ordering by `seq` is what makes polling gap-free. */
export async function messagesAfter(conversationId: string, after: number, limit = 100) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.seq, after)))
    .orderBy(asc(messages.seq))
    .limit(limit);
  return rows.map(toChat);
}

export type NewMessage = {
  conversationId: string;
  senderId: string | null;
  kind: ChatMessage["kind"];
  clientMsgId: string;
  bodyText?: string | null;
  mediaId?: string | null;
  offerId?: string | null;
  aiGenerated?: boolean;
  translatedText?: string | null;
  translatedLang?: "ur" | "en" | null;
};

/**
 * Inserts once per (conversation, client_msg_id). A retry of the same send returns the stored
 * message instead of creating a duplicate, so "failed, tap to retry" can never double-send.
 */
export async function insertMessage(
  m: NewMessage,
): Promise<{ message: ChatMessage; duplicate: boolean }> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: m.conversationId,
      senderId: m.senderId,
      kind: m.kind,
      clientMsgId: m.clientMsgId,
      bodyText: m.bodyText ?? null,
      mediaId: m.mediaId ?? null,
      offerId: m.offerId ?? null,
      aiGenerated: m.aiGenerated ?? false,
      translatedText: m.translatedText ?? null,
      translatedLang: m.translatedLang ?? null,
    })
    .onConflictDoNothing({ target: [messages.conversationId, messages.clientMsgId] })
    .returning();
  if (row) return { message: toChat(row), duplicate: false };
  const [existing] = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.conversationId, m.conversationId), eq(messages.clientMsgId, m.clientMsgId)),
    );
  return { message: toChat(existing!), duplicate: true };
}
