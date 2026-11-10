"use client";

import { useEffect, useRef } from "react";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { cn } from "@/components/ui/cn";
import { messageAudioSrc } from "@/lib/guide";
import { useI18n } from "@/lib/i18n/client";
import { useSpeech } from "./useSpeech";

/**
 * A fixed feedback message ("we did not understand…") shown AND spoken once in the page language,
 * so a worker or customer who does not read still hears what to do next. Uses the pre-generated
 * Urdu file when there is one, else the voice model, else the browser voice; text always stays.
 */
export function SpokenMessage({
  messageKey,
  className,
  testId,
}: {
  messageKey: string;
  className?: string;
  testId?: string;
}) {
  const { tKey, lang } = useI18n();
  const text = tKey(messageKey);
  const src = messageAudioSrc(messageKey, lang);
  const speech = useSpeech(lang, text, { src, voiceModel: true });
  const spokenFor = useRef<string | null>(null);
  const { canSpeak, play } = speech;

  // Speak each new message once; the user just pressed the mic, so playback is allowed.
  useEffect(() => {
    if (!canSpeak || spokenFor.current === messageKey) return;
    spokenFor.current = messageKey;
    void play();
  }, [canSpeak, messageKey, play]);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <p role="alert" className="text-center font-semibold text-danger" data-testid={testId}>
        {text}
      </p>
      <SpeakButton text={text} src={src} voiceModel />
    </div>
  );
}
