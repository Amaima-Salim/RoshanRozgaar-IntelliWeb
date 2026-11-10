"use client";

import { Banknote, Clock, Hammer, Mic, ShieldCheck, Sparkles, Square, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { REVIEW_TAGS, SIGNALS, type Signal } from "@/lib/domain/trust";
import { useOnline } from "@/lib/hooks/use-online";
import { useI18n } from "@/lib/i18n/client";
import { StarPicker } from "./StarRating";

type Answers = Record<Signal, boolean | null>;
type Draft = {
  tags: string[];
  summaryEn: string;
  summaryUr: string;
  flagged: boolean;
  simulated: boolean;
};
type VoiceError = "denied" | "failed" | "off" | null;

const ICONS: Record<Signal, ReactNode> = {
  onTime: <Clock aria-hidden className="size-6" />,
  quality: <Hammer aria-hidden className="size-6" />,
  fairPrice: <Banknote aria-hidden className="size-6" />,
  respectful: <ShieldCheck aria-hidden className="size-6" />,
};
const MAX_MS = 60_000;
const MIN_MS = 700;

async function post<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data?: T }> {
  try {
    const res = await fetch(path, init);
    const json = (await res.json()) as { ok: boolean; data?: T };
    return { ok: res.ok && json.ok, status: res.status, data: json.data };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Review capture (Figma 14): big stars, four yes/no tap signals, an optional voice or typed
 * comment, and an AI draft (tags + bilingual summary) that the customer checks, edits or removes
 * before anything is sent. With AI off the stars and taps alone are enough.
 */
export function ReviewForm({
  jobId,
  workerName,
  aiMode,
}: {
  jobId: string;
  workerName: string;
  aiMode: "live" | "fixtures" | "off";
}) {
  const { t, lang } = useI18n();
  const online = useOnline();
  const [stars, setStars] = useState(0);
  const [signals, setSignals] = useState<Answers>({
    onTime: null,
    quality: null,
    fairPrice: null,
    respectful: null,
  });
  const [comment, setComment] = useState("");
  const [commentLang, setCommentLang] = useState<"ur" | "en" | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<VoiceError>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<"needStars" | "failed" | "already" | null>(null);
  const [done, setDone] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const uploadVoice = async (blob: Blob, durationMs: number) => {
    setVoiceState("processing");
    const form = new FormData();
    form.set("audio", blob, "review-voice");
    form.set("durationMs", String(durationMs));
    const res = await post<{
      mediaId: string;
      transcript: string | null;
      language: "ur" | "en" | null;
    }>(`/api/jobs/${jobId}/review/voice`, { method: "POST", body: form });
    setVoiceState("idle");
    if (!res.ok || !res.data) return setVoiceError("failed");
    setMediaId(res.data.mediaId);
    setDraft(null);
    if (res.data.transcript) {
      setComment(res.data.transcript);
      setCommentLang(res.data.language);
      setVoiceError(null);
    } else setVoiceError("off");
  };

  const startRecording = async () => {
    setVoiceError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia)
      return setVoiceError("denied");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setVoiceError("denied");
    }
    chunks.current = [];
    const rec = new MediaRecorder(stream.current);
    recorder.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current;
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      cleanup();
      if (durationMs < MIN_MS || blob.size === 0) {
        setVoiceState("idle");
        return setVoiceError("failed");
      }
      void uploadVoice(blob, Math.min(durationMs, MAX_MS));
    };
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start();
    setVoiceState("recording");
    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setSeconds(Math.floor(elapsed / 1000));
      if (elapsed >= MAX_MS) rec.stop();
    }, 250);
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  const makeDraft = async () => {
    setDrafting(true);
    setDraftFailed(false);
    const res = await post<{
      draft: { tags: string[]; summaryEn: string; summaryUr: string; flagged: boolean };
      simulated: boolean;
    }>(`/api/jobs/${jobId}/review/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: comment.trim() }),
    });
    setDrafting(false);
    if (!res.ok || !res.data) return setDraftFailed(true);
    setDraft({ ...res.data.draft, simulated: res.data.simulated });
  };

  const submit = async () => {
    if (stars === 0) return setError("needStars");
    setSending(true);
    setError(null);
    const text = comment.trim();
    const res = await post(`/api/jobs/${jobId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stars,
        signals,
        ...(text && { commentText: text, commentLang: commentLang ?? lang }),
        ...(mediaId && { voiceMediaId: mediaId }),
        ...(draft &&
          text && {
            ai: {
              tags: draft.tags,
              summaryEn: draft.summaryEn,
              summaryUr: draft.summaryUr,
              flagged: draft.flagged,
            },
          }),
      }),
    });
    setSending(false);
    if (res.ok) return setDone(true);
    setError(res.status === 409 ? "already" : "failed");
  };

  if (done)
    return (
      <section
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
        data-testid="review-thanks"
      >
        <p className="text-lg font-semibold text-primary-strong">{t("trust.review.thanks")}</p>
        <Button asChild variant="outline" label={t("trust.review.backToJob")}>
          <Link href={`/c/job/${jobId}`}>{t("trust.review.backToJob")}</Link>
        </Button>
      </section>
    );

  const canDraft = aiMode !== "off" && comment.trim().length > 0 && !draft;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]" data-testid="review-form">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">{t("trust.review.starsLabel")}</h2>
          <StarPicker value={stars} onChange={setStars} />
          <p className="text-sm text-text-muted">{t("trust.review.starsHelp")}</p>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <div>
            <h2 className="text-lg font-semibold">{t("trust.review.signalsTitle")}</h2>
            <p className="text-sm text-text-muted">{t("trust.review.signalsHint")}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {SIGNALS.map((s) => (
              <li key={s}>
                <fieldset className="flex flex-col gap-2" data-testid={`signal-${s}`}>
                  <legend className="flex items-center gap-2 font-medium">
                    <span className="text-primary">{ICONS[s]}</span>
                    {t(`trust.review.${s}`)}
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {([true, false, null] as const).map((v) => {
                      const key = v === true ? "yes" : v === false ? "no" : "skip";
                      const on = signals[s] === v;
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setSignals((p) => ({ ...p, [s]: v }))}
                          className={cn(
                            "min-h-touch rounded-lg border-2 px-2 font-semibold",
                            on
                              ? "border-primary bg-primary-soft text-primary-strong"
                              : "border-border bg-surface",
                          )}
                          data-testid={`signal-${s}-${key}`}
                        >
                          {t(`trust.review.${key}`)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">{t("trust.review.commentTitle")}</h2>
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setDraft(null);
            }}
            maxLength={1000}
            rows={3}
            dir="auto"
            placeholder={t("trust.review.commentPlaceholder")}
            aria-label={t("trust.review.commentTitle")}
            className="min-h-24 rounded-lg border-2 border-border bg-surface p-3"
            data-testid="review-comment"
          />
          <div className="flex flex-wrap items-center gap-3">
            {voiceState === "recording" ? (
              <Button
                variant="danger"
                icon={<Square aria-hidden className="size-5" />}
                label={t("trust.review.stop")}
                onClick={stopRecording}
                data-testid="review-stop"
              />
            ) : (
              <Button
                variant="secondary"
                icon={<Mic aria-hidden className="size-5" />}
                label={t("trust.review.record")}
                disabled={voiceState === "processing" || !online}
                onClick={() => void startRecording()}
                data-testid="review-record"
              />
            )}
            <span aria-live="polite" className="text-sm text-text-muted">
              {voiceState === "recording"
                ? t("trust.review.recording", { seconds })
                : voiceState === "processing"
                  ? t("trust.review.understanding")
                  : mediaId && !voiceError
                    ? t("trust.review.voiceSaved")
                    : null}
            </span>
          </div>
          {voiceError ? (
            <p role="alert" className="font-medium text-danger" data-testid="review-voice-error">
              {t(
                voiceError === "denied"
                  ? "trust.review.voiceDenied"
                  : voiceError === "off"
                    ? "trust.review.voiceOff"
                    : "trust.review.voiceFailed",
              )}
            </p>
          ) : null}
          {canDraft ? (
            <Button
              variant="outline"
              icon={<Sparkles aria-hidden className="size-5" />}
              label={t("trust.review.makeDraft")}
              loading={drafting}
              disabled={!online}
              onClick={() => void makeDraft()}
              data-testid="review-make-draft"
            />
          ) : null}
          {draftFailed ? (
            <p role="status" className="text-text-muted" data-testid="review-draft-failed">
              {t("trust.review.draftFailed")}
            </p>
          ) : null}
        </section>

        {error ? (
          <p role="alert" className="font-semibold text-danger" data-testid="review-error">
            {t(
              error === "needStars"
                ? "trust.review.needStars"
                : error === "already"
                  ? "trust.review.already"
                  : "trust.review.failed",
            )}
          </p>
        ) : null}
        {!online ? <Banner kind="offline" /> : null}
        <Button
          size="lg"
          fullWidth
          label={sending ? t("trust.review.submitting") : t("trust.review.submit")}
          loading={sending}
          disabled={!online}
          onClick={() => void submit()}
          data-testid="review-submit"
        />
      </div>

      <aside aria-label={t("trust.review.draftTitle")} className="flex flex-col gap-3">
        {draft ? (
          <section
            className="flex flex-col gap-3 rounded-xl border-2 border-info/40 bg-info-soft/40 p-5"
            data-testid="review-draft"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{t("trust.review.draftTitle")}</h2>
              <Badge kind="ai" />
              {draft.simulated || aiMode === "fixtures" ? (
                <span
                  className="rounded-pill bg-canvas px-2.5 py-0.5 text-sm"
                  data-testid="simulated-ai"
                >
                  {t("voiceNote.simulated")}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-text-muted">{t("trust.review.draftHint")}</p>
            {draft.flagged ? (
              <p
                role="alert"
                className="font-medium text-danger"
                data-testid="review-draft-flagged"
              >
                {t("trust.review.draftFlagged")}
              </p>
            ) : null}
            <fieldset className="flex flex-col gap-2">
              <legend className="font-medium">{t("trust.review.draftTags")}</legend>
              <ul className="flex flex-wrap gap-2">
                {REVIEW_TAGS.map((tag) => {
                  const on = draft.tags.includes(tag);
                  return (
                    <li key={tag}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  tags: on ? d.tags.filter((x) => x !== tag) : [...d.tags, tag],
                                }
                              : d,
                          )
                        }
                        className={cn(
                          "min-h-touch rounded-pill border-2 px-3 text-sm font-medium",
                          on ? "border-primary bg-primary-soft" : "border-border bg-surface",
                        )}
                        data-testid={`draft-tag-${tag}`}
                      >
                        {t(`trust.tags.${tag}`)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <label className="flex flex-col gap-1 font-medium">
              {t("trust.review.draftEn")}
              <textarea
                value={draft.summaryEn}
                onChange={(e) => setDraft({ ...draft, summaryEn: e.target.value })}
                dir="ltr"
                rows={2}
                maxLength={300}
                className="rounded-lg border-2 border-border bg-surface p-2 font-normal"
                data-testid="draft-summary-en"
              />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              {t("trust.review.draftUr")}
              <textarea
                value={draft.summaryUr}
                onChange={(e) => setDraft({ ...draft, summaryUr: e.target.value })}
                dir="rtl"
                rows={2}
                maxLength={300}
                className="rounded-lg border-2 border-border bg-surface p-2 font-normal"
                data-testid="draft-summary-ur"
              />
            </label>
            <Button
              variant="outline"
              icon={<X aria-hidden className="size-5" />}
              label={t("trust.review.draftRemove")}
              onClick={() => setDraft(null)}
              data-testid="draft-remove"
            />
          </section>
        ) : (
          <p className="rounded-xl bg-canvas p-4 text-sm text-text-muted">
            {t("trust.review.intro", { name: workerName })}
          </p>
        )}
      </aside>
    </div>
  );
}
