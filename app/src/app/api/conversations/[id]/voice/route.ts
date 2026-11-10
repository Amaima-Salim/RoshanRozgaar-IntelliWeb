import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AiUnavailableError } from "@/lib/ai/errors";
import { transcribeVoiceNote, translateText } from "@/lib/ai/chat";
import { HttpError, ok, route } from "@/lib/api/respond";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { requireParticipant } from "@/lib/chat/conversations";
import { insertMessage } from "@/lib/chat/messages";
import { db } from "@/lib/db/client";
import { media, messages, users } from "@/lib/db/schema";
import { sniffAudio } from "@/lib/media/audio";

type Ctx = { params: Promise<{ id: string }> };

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const fieldsSchema = z.object({
  clientMsgId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  durationMs: z.coerce.number().int().min(500).max(60_000),
});

/**
 * Send a voice note (≤ 60 s, ≤ 2 MB, type checked by magic bytes). The audio is always delivered;
 * the transcript and the translation into the other person's language (AI-04) are best-effort
 * and labelled as AI. If they fail, the note stays audio-only.
 */
export const POST = route<Ctx>("messages.voice", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const p = await requireParticipant(id, user.id);
  if (!["open", "booked"].includes(p.status))
    throw new HttpError("CONFLICT_STATE", { reason: "conversation_closed" });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES + 64 * 1024) throw new HttpError("PAYLOAD_TOO_LARGE");
  await enforceLimit(`chat-voice:${user.id}`, 10, 60);

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!form || !(file instanceof File)) throw new HttpError("VALIDATION", { reason: "audio" });
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  const fields = fieldsSchema.safeParse({
    clientMsgId: form.get("clientMsgId"),
    durationMs: form.get("durationMs"),
  });
  if (!fields.success) throw new HttpError("VALIDATION", { reason: "fields" });

  // A retry of the same send returns what was stored, with no second upload.
  const [dupe] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, id), eq(messages.clientMsgId, fields.data.clientMsgId)));
  if (dupe) {
    const again = await insertMessage({
      conversationId: id,
      senderId: user.id,
      kind: "voice",
      clientMsgId: fields.data.clientMsgId,
    });
    return ok({ message: again.message, duplicate: true }, { status: 200 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffAudio(bytes);
  if (!mime) throw new HttpError("VALIDATION", { reason: "audio_type" });

  const [stored] = await db
    .insert(media)
    .values({
      ownerId: user.id,
      kind: "audio",
      mime,
      sizeBytes: bytes.length,
      durationMs: fields.data.durationMs,
      data: Buffer.from(bytes),
    })
    .returning({ id: media.id });
  const { message } = await insertMessage({
    conversationId: id,
    senderId: user.id,
    kind: "voice",
    clientMsgId: fields.data.clientMsgId,
    mediaId: stored!.id,
  });

  // AI-04: transcript, then translation if the other person reads the other language.
  let transcriptText: string | null = null;
  let transcriptLang: "ur" | "en" | null = null;
  let translatedText: string | null = null;
  let translatedLang: "ur" | "en" | null = null;
  let simulated = false;
  try {
    const t = await transcribeVoiceNote({ bytes, mime });
    transcriptText = t.transcript.text;
    transcriptLang = t.transcript.language === "en" ? "en" : "ur";
    simulated = t.simulated;
    const [other] = await db
      .select({ language: users.language })
      .from(users)
      .where(eq(users.id, p.otherId));
    if (other && other.language !== transcriptLang) {
      try {
        const tr = await translateText({
          text: transcriptText,
          from: transcriptLang,
          to: other.language,
        });
        translatedText = tr.translation;
        translatedLang = other.language;
        simulated ||= tr.simulated;
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err; // transcript alone still helps
      }
    }
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
  }

  if (transcriptText) {
    await db
      .update(messages)
      .set({ transcriptText, transcriptLang, translatedText, translatedLang, aiGenerated: true })
      .where(eq(messages.id, message.id));
  }
  const [final] = await db.select().from(messages).where(eq(messages.id, message.id));
  return ok(
    {
      message: {
        ...message,
        transcriptText,
        transcriptLang,
        translatedText,
        translatedLang,
        aiGenerated: !!transcriptText,
        createdAt: final?.createdAt.toISOString() ?? message.createdAt,
      },
      simulated,
      duplicate: false,
    },
    { status: 201 },
  );
});
