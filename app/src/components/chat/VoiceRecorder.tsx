"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ChatMessage } from "@/lib/chat/messages";
import { useI18n } from "@/lib/i18n/client";
import { useOnline } from "@/lib/hooks/use-online";

const MAX_MS = 60_000;
const MIN_MS = 700;

const newId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Phase = "idle" | "recording" | "uploading";

/**
 * Records a voice note (≤ 60 s) and sends it. The browser asks for the microphone only when the
 * button is pressed; if it is blocked or missing, the message says so and typing / quick replies
 * still work. The note keeps one client id until it is delivered, so a retry never duplicates it.
 */
export function VoiceRecorder({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: (m: ChatMessage) => void;
}) {
  const { t } = useI18n();
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<"denied" | "unsupported" | "short" | "failed" | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pending = useRef<{ blob: Blob; durationMs: number; id: string } | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const upload = async (blob: Blob, durationMs: number, id: string) => {
    setPhase("uploading");
    try {
      const form = new FormData();
      form.set("audio", blob, "voice-note");
      form.set("durationMs", String(durationMs));
      form.set("clientMsgId", id);
      const res = await fetch(`/api/conversations/${conversationId}/voice`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { ok: boolean; data?: { message: ChatMessage } };
      if (!res.ok || !json.ok || !json.data) throw new Error("voice");
      pending.current = null;
      onSent(json.data.message);
      setError(null);
    } catch {
      setError("failed"); // `pending` is kept: pressing the button again retries the same note
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
    setError(null);
    if (pending.current) {
      const p = pending.current;
      return upload(p.blob, p.durationMs, p.id);
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("denied");
      return;
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
        setPhase("idle");
        setError("short");
        return;
      }
      const id = newId();
      pending.current = { blob, durationMs: Math.min(durationMs, MAX_MS), id };
      void upload(blob, pending.current.durationMs, id);
    };
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start();
    setPhase("recording");
    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setSeconds(Math.floor(elapsed / 1000));
      if (elapsed >= MAX_MS) rec.stop();
    }, 250);
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  const cancel = () => {
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    cleanup();
    pending.current = null;
    setPhase("idle");
  };

  return (
    <div className="flex flex-col gap-1">
      {phase === "recording" ? (
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            icon={<Square aria-hidden className="size-5" />}
            label={t("voiceNote.stopSend")}
            onClick={stop}
            data-testid="voice-stop"
          />
          <span className="num text-sm" role="timer" data-testid="voice-timer">
            {t("voiceNote.recording", { seconds })}
          </span>
          <button
            type="button"
            onClick={cancel}
            className="min-h-touch px-2 text-sm font-medium underline"
          >
            {t("voiceNote.cancel")}
          </button>
        </div>
      ) : (
        <Button
          variant="outline"
          icon={<Mic aria-hidden className="size-5" />}
          label={t("voiceNote.record")}
          loading={phase === "uploading"}
          disabled={!online}
          onClick={() => void start()}
          data-testid="voice-record"
        />
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger" data-testid="voice-error">
          {error === "denied"
            ? t("voiceNote.denied")
            : error === "unsupported"
              ? t("voiceNote.unsupported")
              : error === "short"
                ? t("voiceNote.tooShort")
                : t("voiceNote.sendFailed")}
        </p>
      ) : null}
    </div>
  );
}
