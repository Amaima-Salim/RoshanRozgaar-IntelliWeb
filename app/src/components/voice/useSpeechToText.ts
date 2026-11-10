"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicState } from "@/components/ui/MicButton";
import type { StepId } from "@/lib/domain/worker-profile";

const CONSENT_KEY = "rr_mic_consent";
const MAX_RECORD_MS = 20_000;
const MIN_RECORD_MS = 700;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => SpeechRecognitionLike;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
}

export type SttFailure = "failed" | "denied";

/**
 * Tap to record, tap to stop → Urdu speech to text (Groq Whisper on the server, the browser's own
 * ur-PK recogniser as the fallback). Asks for mic consent once per session. Hands the text to
 * `onText`; any failure ends in `onFail` and the caller shows its tap/typed path.
 * While `onText` runs the state stays "processing", so callers can chain more work; it returns
 * `false` when that later work failed, which shows the mic's error state.
 */
export function useSpeechToText(opts: {
  purpose: "onboarding" | "request";
  stepId?: StepId;
  onText: (text: string, simulated: boolean) => Promise<boolean> | boolean;
  onFail: (reason: SttFailure) => void;
}) {
  const { purpose, stepId, onText, onFail } = opts;
  const [state, setState] = useState<MicState>("idle");
  const [needConsent, setNeedConsent] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const browserText = useRef("");
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const cleanup = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try {
      recognition.current?.abort();
    } catch {
      /* already stopped */
    }
    recognition.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanup();
    };
  }, [cleanup]);

  const fail = useCallback(
    (reason: SttFailure) => {
      if (!alive.current) return;
      setState("error");
      onFail(reason);
    },
    [onFail],
  );

  const finish = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (durationMs < MIN_RECORD_MS || blob.size === 0) return fail("failed");
      const form = new FormData();
      form.set("audio", blob, "answer");
      form.set("purpose", purpose);
      if (stepId) form.set("stepId", stepId);
      form.set("durationMs", String(Math.round(durationMs)));
      let stt: { text: string; simulated: boolean } | null = null;
      try {
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
        const json = (await res.json()) as {
          ok: boolean;
          data?: { text: string; simulated: boolean };
        };
        stt = res.ok && json.ok && json.data ? json.data : null;
      } catch {
        stt = null;
      }
      // Server speech-to-text down: use what the browser's own recogniser heard, if anything.
      const text = stt?.text || browserText.current.trim();
      if (!text) return fail("failed");
      if (!alive.current) return;
      const okay = await onText(text, !!stt?.simulated);
      if (alive.current) setState(okay ? "idle" : "error");
    },
    [fail, onText, purpose, stepId],
  );

  const begin = useCallback(async () => {
    const mime = pickMime();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return fail("failed");
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return fail("denied");
    }
    stream.current = media;
    browserText.current = "";
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      cleanup();
      setState("processing");
      void finish(blob, durationMs);
    };

    // Browser recogniser runs alongside as the fallback when server STT is unavailable.
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      try {
        const sr = new Ctor();
        sr.lang = "ur-PK";
        sr.interimResults = false;
        sr.continuous = true;
        sr.onresult = (e) => {
          browserText.current = Array.from(e.results)
            .map((r) => r[0]?.transcript ?? "")
            .join(" ");
        };
        sr.onerror = () => {};
        sr.start();
        recognition.current = sr;
      } catch {
        recognition.current = null;
      }
    }

    startedAt.current = Date.now();
    rec.start();
    setState("listening");
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORD_MS);
  }, [cleanup, fail, finish]);

  const press = useCallback(() => {
    if (state === "listening") {
      if (recorder.current?.state === "recording") recorder.current.stop();
      return;
    }
    if (state === "processing") return;
    let consented = false;
    try {
      consented = sessionStorage.getItem(CONSENT_KEY) === "1";
    } catch {
      /* storage blocked: ask every time */
    }
    if (!consented) {
      setNeedConsent(true);
      return;
    }
    void begin();
  }, [begin, state]);

  const acceptConsent = useCallback(() => {
    try {
      sessionStorage.setItem(CONSENT_KEY, "1");
    } catch {
      /* ignore */
    }
    setNeedConsent(false);
    void begin();
  }, [begin]);

  const declineConsent = useCallback(() => setNeedConsent(false), []);

  return { state, needConsent, press, acceptConsent, declineConsent };
}
