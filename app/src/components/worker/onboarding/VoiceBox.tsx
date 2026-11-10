"use client";

import { FlaskConical, Sparkles } from "lucide-react";
import { MicButton } from "@/components/ui/MicButton";
import { SpokenMessage } from "@/components/voice/SpokenMessage";
import type { WorkerProfileDraft } from "@/lib/ai/schemas";
import type { StepId } from "@/lib/domain/worker-profile";
import { useI18n } from "@/lib/i18n/client";
import { useVoiceAnswer } from "./useVoiceAnswer";
import { VoiceConsent } from "./VoiceConsent";

/**
 * "Say it" for one step: mic, what we heard, an AI-draft label, and a clear message when
 * speech didn't work. The answer only pre-selects tiles; the worker still taps Next.
 */
export function VoiceBox({
  stepId,
  fixtures,
  onDraft,
}: {
  stepId: StepId;
  /** AI_MODE=fixtures: recorded transcripts are replayed and labelled as simulated. */
  fixtures: boolean;
  onDraft: (draft: WorkerProfileDraft) => void;
}) {
  const { t } = useI18n();
  const voice = useVoiceAnswer({ stepId, onDraft });
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl bg-canvas p-4"
      data-testid="voice-box"
    >
      <MicButton state={voice.state} onPress={voice.press} />
      {fixtures || voice.simulated ? (
        <span
          className="inline-flex items-center gap-1 rounded-pill border border-accent bg-accent-soft px-2.5 py-0.5 text-sm font-medium"
          data-testid="simulated-ai"
        >
          <FlaskConical aria-hidden className="size-3.5" />
          {t("onboarding.voice.simulated")}
        </span>
      ) : null}
      {voice.heard ? (
        <p
          className="flex flex-wrap items-center justify-center gap-2 text-center"
          data-testid="heard"
        >
          <span dir="auto">{t("onboarding.voice.heard", { text: voice.heard })}</span>
          <span className="inline-flex items-center gap-1 rounded-pill bg-info-soft px-2.5 py-0.5 text-sm font-medium text-info">
            <Sparkles aria-hidden className="size-3.5" />
            {t("onboarding.voice.aiLabel")}
          </span>
        </p>
      ) : null}
      {voice.messageKey ? (
        <SpokenMessage messageKey={voice.messageKey} testId="voice-message" />
      ) : null}
      {voice.needConsent ? (
        <VoiceConsent onAccept={voice.acceptConsent} onDecline={voice.declineConsent} />
      ) : null}
    </div>
  );
}
