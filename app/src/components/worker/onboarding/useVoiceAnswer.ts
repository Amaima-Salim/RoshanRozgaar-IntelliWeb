"use client";

import { useCallback, useState } from "react";
import { useSpeechToText, type SttFailure } from "@/components/voice/useSpeechToText";
import type { WorkerProfileDraft } from "@/lib/ai/schemas";
import type { StepId } from "@/lib/domain/worker-profile";

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
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);

  const onFail = useCallback(
    (reason: SttFailure) =>
      setMessageKey(reason === "denied" ? "onboarding.voice.denied" : "onboarding.voice.failed"),
    [],
  );

  const onText = useCallback(
    async (text: string, sim: boolean) => {
      setHeard(text);
      setSimulated(sim);
      const extracted = await api<{ draft: WorkerProfileDraft }>("/api/ai/extract-worker-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, transcript: text.slice(0, 500) }),
      });
      if (!extracted) {
        setMessageKey("onboarding.voice.failed");
        return false;
      }
      if (isEmptyDraft(extracted.draft)) {
        setMessageKey(MESSAGE_FOR_STEP[stepId]);
        return false;
      }
      onDraft(extracted.draft);
      setMessageKey(null);
      return true;
    },
    [onDraft, stepId],
  );

  const stt = useSpeechToText({ purpose: "onboarding", stepId, onText, onFail });

  const press = useCallback(() => {
    if (stt.state !== "listening" && stt.state !== "processing") {
      setMessageKey(null);
      setHeard(null);
    }
    stt.press();
  }, [stt]);

  return {
    state: stt.state,
    messageKey,
    heard,
    simulated,
    needConsent: stt.needConsent,
    press,
    acceptConsent: stt.acceptConsent,
    declineConsent: stt.declineConsent,
  };
}
