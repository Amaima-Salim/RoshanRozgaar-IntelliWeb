"use client";

import { Handshake, RotateCcw, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { ChatMessage } from "@/lib/chat/messages";
import type { OfferView } from "@/lib/chat/offers";
import { OfferCard } from "./OfferCard";
import { OfferComposer, type OfferDraft } from "./OfferComposer";
import { VoiceRecorder } from "./VoiceRecorder";
import { CUSTOMER_QUICK, WORKER_QUICK, type QuickKey } from "@/lib/chat/quick-replies";
import { formatKarachiTime } from "@/lib/domain/time";
import { useI18n } from "@/lib/i18n/client";

const POLL_MS = 4000;

type Local = ChatMessage & { local?: "sending" | "failed" };

const newClientId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function post(conversationId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "text", ...payload }),
  });
  const json = (await res.json()) as { ok: boolean; data?: { message: ChatMessage } };
  if (!res.ok || !json.ok || !json.data) throw new Error("send");
  return json.data.message;
}

/**
 * The chat thread. Polls `?after=seq` every 4 s while the tab is visible and online; sends are
 * optimistic, and a failed send stays on screen with a retry that reuses the same client id so
 * it can never arrive twice (docs/02 §7).
 */
export function ChatView({
  conversationId,
  viewerId,
  role,
  initial,
  initialOffers,
  open,
  canOffer,
  otherName,
  request,
}: {
  conversationId: string;
  viewerId: string;
  role: "customer" | "worker";
  initial: ChatMessage[];
  initialOffers: OfferView[];
  open: boolean;
  canOffer: boolean;
  otherName: string;
  request: { startAt: string; durationMin: number; ratePkr: number | null };
}) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Local[]>(initial);
  const payloads = useRef(new Map<string, Record<string, unknown>>());
  const [text, setText] = useState("");
  const [offers, setOffers] = useState<Map<string, OfferView>>(
    () => new Map(initialOffers.map((o) => [o.id, o])),
  );
  const [composer, setComposer] = useState<{ counterOf?: OfferView; draft?: OfferDraft } | null>(
    null,
  );
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const putOffers = useCallback((list: OfferView[]) => {
    setOffers((prev) => {
      const next = new Map(prev);
      for (const o of list) next.set(o.id, o);
      return next;
    });
  }, []);
  const [pollError, setPollError] = useState(false);
  const lastSeq = useRef(initial.at(-1)?.seq ?? 0);
  const bottom = useRef<HTMLLIElement>(null);

  const merge = useCallback((fromServer: ChatMessage[]) => {
    if (!fromServer.length) return;
    const incoming: Local[] = fromServer;
    setMessages((prev) => {
      const byClient = new Map(incoming.map((m) => [m.clientMsgId, m]));
      // A server copy replaces the optimistic one with the same client id.
      const kept = prev.filter((m) => !(m.local && byClient.has(m.clientMsgId)));
      const known = new Set(kept.filter((m) => !m.local).map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return [...kept.filter((m) => !m.local), ...fresh, ...kept.filter((m) => m.local)].sort(
        (a, b) => (a.local ? 1 : 0) - (b.local ? 1 : 0) || a.seq - b.seq,
      );
    });
    lastSeq.current = Math.max(lastSeq.current, ...fromServer.map((m) => m.seq));
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages?after=${lastSeq.current}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as {
          ok: boolean;
          data?: { messages: ChatMessage[]; offers?: OfferView[] };
        };
        if (stopped) return;
        if (!res.ok || !json.ok || !json.data) throw new Error("poll");
        setPollError(false);
        merge(json.data.messages);
        if (json.data.offers) putOffers(json.data.offers);
      } catch {
        if (!stopped) setPollError(true);
      }
    };
    const id = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, merge, putOffers]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (payload: Record<string, unknown>, clientMsgId: string, preview: string) => {
    payloads.current.set(clientMsgId, payload);
    setMessages((prev) => {
      const rest = prev.filter((m) => m.clientMsgId !== clientMsgId);
      return [
        ...rest,
        {
          id: `local-${clientMsgId}`,
          seq: Number.MAX_SAFE_INTEGER,
          senderId: viewerId,
          kind: "text",
          bodyText: preview,
          mediaId: null,
          transcriptText: null,
          transcriptLang: null,
          translatedText: null,
          translatedLang: null,
          aiGenerated: false,
          offerId: null,
          clientMsgId,
          createdAt: new Date().toISOString(),
          local: "sending",
        },
      ];
    });
    try {
      merge([await post(conversationId, { ...payload, clientMsgId })]);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, local: "failed" } : m)),
      );
    }
  };

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    void send({ bodyText: body }, newClientId(), body);
  };
  const sendQuick = (key: QuickKey) =>
    void send({ quickReply: key }, newClientId(), t(`chat.quick.${key}`));
  const retry = (m: Local) =>
    void send(
      payloads.current.get(m.clientMsgId) ?? { bodyText: m.bodyText },
      m.clientMsgId,
      m.bodyText ?? "",
    );

  const draftFromVoice = async (messageId: string) => {
    setDraftBusy(messageId);
    setDraftNote(null);
    try {
      const res = await fetch("/api/ai/draft-offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { pricePkr: number | null; aiDrafted: boolean };
      };
      if (!res.ok || !json.ok || !json.data) throw new Error("draft");
      if (json.data.pricePkr == null) setDraftNote(t("offerCard.noAmountHeard"));
      setComposer({
        draft: { pricePkr: json.data.pricePkr, aiDrafted: json.data.pricePkr != null },
      });
    } catch {
      setDraftNote(t("offerCard.failed"));
      setComposer({});
    } finally {
      setDraftBusy(null);
    }
  };

  const quick = role === "customer" ? CUSTOMER_QUICK : WORKER_QUICK;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ol
        className="flex min-h-64 flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-canvas p-3"
        aria-live="polite"
        data-testid="messages"
      >
        {messages.length === 0 ? (
          <li className="m-auto text-text-muted">{t("chat.empty2")}</li>
        ) : null}
        {messages.map((m) => {
          const mine = m.senderId === viewerId;
          // The viewer reads the version in their own language when one exists.
          const shown =
            m.translatedText && m.translatedLang === lang ? m.translatedText : m.bodyText;
          const original = shown !== m.bodyText ? m.bodyText : null;
          if (m.kind === "offer") {
            const offer = m.offerId ? offers.get(m.offerId) : undefined;
            return (
              <li key={m.id} className="flex flex-col" data-testid="message" data-mine={mine}>
                {offer ? (
                  <OfferCard
                    offer={offer}
                    mine={mine}
                    otherName={otherName}
                    role={role}
                    aiDrafted={m.aiGenerated}
                    onCounter={(o) => setComposer({ counterOf: o })}
                    onChanged={(o) => putOffers([o])}
                  />
                ) : null}
              </li>
            );
          }
          return (
            <li
              key={m.id}
              className={cn(
                "flex max-w-[85%] flex-col gap-1 rounded-lg px-3 py-2",
                mine ? "self-end bg-primary text-on-primary" : "self-start bg-surface",
                m.local === "failed" && "border-2 border-danger",
              )}
              data-testid="message"
              data-mine={mine}
            >
              {m.kind === "voice" && m.mediaId ? (
                <div className="flex flex-col gap-1" data-testid="voice-message">
                  <audio
                    controls
                    preload="none"
                    src={`/api/media/${m.mediaId}`}
                    aria-label={t("voiceNote.audioLabel")}
                    className="max-w-full"
                  />
                  {m.transcriptText ? (
                    <>
                      <p dir="auto" data-testid="voice-transcript">
                        <span className="text-xs opacity-80">{t("voiceNote.transcript")}: </span>
                        {m.transcriptText}
                      </p>
                      {m.translatedText ? (
                        <p dir="auto" data-testid="voice-translation">
                          <span className="text-xs opacity-80">{t("voiceNote.translated")}: </span>
                          {m.translatedText}
                        </p>
                      ) : null}
                      <p className="inline-flex items-center gap-1 text-xs opacity-80">
                        <Sparkles aria-hidden className="size-3.5" />
                        {t("voiceNote.aiLabel")}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs opacity-80">{t("voiceNote.audioOnly")}</p>
                  )}
                  {!mine && canOffer && m.transcriptText ? (
                    <button
                      type="button"
                      onClick={() => void draftFromVoice(m.id)}
                      disabled={draftBusy === m.id}
                      className="inline-flex min-h-touch items-center gap-1 self-start font-semibold underline"
                      data-testid="offer-from-voice"
                    >
                      <Handshake aria-hidden className="size-4" />
                      {t("offerCard.fromVoice")}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p dir="auto">{shown}</p>
              )}
              {original ? (
                <p dir="auto" className="text-xs opacity-80">
                  {t("chat.original", { text: original })}
                </p>
              ) : null}
              <p className="num flex items-center gap-2 text-xs opacity-80">
                {m.local === "sending"
                  ? t("chat.sending")
                  : m.local === "failed"
                    ? t("chat.failed")
                    : formatKarachiTime(new Date(m.createdAt), lang)}
                {m.local === "failed" ? (
                  <button
                    type="button"
                    onClick={() => retry(m)}
                    className="inline-flex min-h-touch items-center gap-1 font-semibold underline"
                    data-testid="retry-send"
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    {t("chat.retry")}
                  </button>
                ) : null}
              </p>
            </li>
          );
        })}
        <li ref={bottom} aria-hidden />
      </ol>

      {pollError ? (
        <p role="status" className="text-sm text-text-muted" data-testid="poll-error">
          {t("chat.loadError")}
        </p>
      ) : null}

      {open ? (
        <div className="sticky bottom-0 flex flex-col gap-2 bg-surface pb-2">
          <ul className="flex flex-wrap gap-2" aria-label={t("chat.quickTitle")}>
            {quick.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => sendQuick(k)}
                  className="min-h-touch rounded-pill border-2 border-primary px-4 font-medium text-primary hover:bg-primary-soft"
                  data-testid={`quick-${k}`}
                >
                  {t(`chat.quick.${k}`)}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-start gap-2">
            <VoiceRecorder conversationId={conversationId} onSent={(msg) => merge([msg])} />
            {canOffer ? (
              <Button
                variant="outline"
                icon={<Handshake aria-hidden className="size-5" />}
                label={t("offerCard.newOffer")}
                onClick={() => setComposer({})}
                data-testid="offer-new"
              />
            ) : null}
          </div>
          {draftNote ? (
            <p role="status" className="text-sm text-text-muted" data-testid="draft-note">
              {draftNote}
            </p>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendText();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder={t("chat.placeholder")}
              aria-label={t("chat.placeholder")}
              className="h-14 min-w-0 flex-1 rounded-lg border-2 border-border bg-surface px-4 text-lg focus:border-primary"
              data-testid="chat-input"
            />
            <Button
              type="submit"
              icon={<Send aria-hidden className="rtl:-scale-x-100" />}
              label={t("chat.send")}
              disabled={!text.trim()}
              data-testid="chat-send"
            />
          </form>
        </div>
      ) : (
        <p className="text-text-muted">{t("chat.noOpen")}</p>
      )}
      {composer ? (
        <OfferComposer
          conversationId={conversationId}
          requestStartAt={request.startAt}
          requestDurationMin={request.durationMin}
          ratePkr={request.ratePkr}
          counterOf={composer.counterOf}
          draft={composer.draft}
          onClose={() => setComposer(null)}
          onSent={(o) => {
            putOffers([o]);
            if (composer.counterOf) putOffers([{ ...composer.counterOf, status: "countered" }]);
            setComposer(null);
            setDraftNote(null);
          }}
        />
      ) : null}
    </div>
  );
}
