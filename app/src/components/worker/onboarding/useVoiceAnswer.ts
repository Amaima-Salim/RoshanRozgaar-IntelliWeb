"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicState } from "@/components/ui/MicButton";
import type { WorkerProfileDraft } from "@/lib/ai/schemas";
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

const MESSAGE_FOR_STEP: Record<StepId, string> = {
  trade: "onboarding.voice.unknownTrade",
  years: "onboarding.voice.unknownYears",
  areas: "onboarding.voice.unknownAreas",
  rate: "onboarding.voice.unknownRate",
  schedule: "onboarding.voice.unknownSchedule",
  photo: "onboarding.voice.failed",
};

const isEmptyDraft = (d: WorkerProfileDraft) =>
  d.trade === null &&
  d.yearsExperience === null &&
  d.areaSlugs.length === 0 &&
  d.indicativeRatePkr === null &&
  d.rateBasis === null &&
  d.weekdays.length === 0 &&
  d.dayParts.length === 0;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
}

async function api<T>(path: string, init: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, init);
    const json = (await res.json()) as { ok: boolean; data?: T };
    return res.ok && json.ok && json.data ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * One spoken answer per press (docs/04 §4): record → transcribe → extract THIS step's field →
 * hand the draft to the caller, which pre-selects the tile for the worker to confirm. Every
 * failure ends in `messageKey` plus the tap path; nothing here ever advances the flow.
 */
export function useVoiceAnswer(opts: {
  stepId: StepId;
  onDraft: (draft: WorkerProfileDraft) => void;
}) {
  const { stepId, onDraft } = opts;
  const [state, setState] = useState<MicState>("idle");
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
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

  const fail = useCallback((key: string) => {
    if (!alive.current) return;
    setMessageKey(key);
    setState("error");
  }, []);

  const finish = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (durationMs < MIN_RECORD_MS || blob.size === 0) return fail("onboarding.voice.failed");
      const form = new FormData();
      form.set("audio", blob, "answer.webm");
      form.set("stepId", stepId);
      form.set("durationMs", String(Math.round(durationMs)));
      const stt = await api<{ text: string; simulated: boolean }>("/api/ai/transcribe", {
        method: "POST",
        body: form,
      });
      // Server speech-to-text down: use what the browser's own recogniser heard, if anything.
      const text = stt?.text || browserText.current.trim();
      if (!text) return fail("onboarding.voice.failed");
      if (!alive.current) return;
      setHeard(text);
      setSimulated(!!stt?.simulated);

      const extracted = await api<{ draft: WorkerProfileDraft }>("/api/ai/extract-worker-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, transcript: text.slice(0, 500) }),
      });
      if (!extracted) return fail("onboarding.voice.failed");
      if (isEmptyDraft(extracted.draft)) return fail(MESSAGE_FOR_STEP[stepId]);
      if (!alive.current) return;
      onDraft(extracted.draft);
      setMessageKey(null);
      setState("idle");
    },
    [fail, onDraft, stepId],
  );

  const begin = useCallback(async () => {
    setMessageKey(null);
    setHeard(null);
    const mime = pickMime();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return fail("onboarding.voice.failed");
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return fail("onboarding.voice.denied");
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

  return { state, messageKey, heard, simulated, needConsent, press, acceptConsent, declineConsent };
}
