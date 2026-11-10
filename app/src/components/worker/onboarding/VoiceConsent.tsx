"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { useI18n } from "@/lib/i18n/client";

/** Shown once per session before the first mic use (docs/04 §6): what, who, how long. */
export function VoiceConsent({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t, bi } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[data-testid='consent-accept']")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDecline();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/50 p-0 md:items-center md:p-6">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="flex max-h-dvh w-full flex-col gap-4 overflow-y-auto rounded-t-xl bg-surface p-6 md:max-w-lg md:rounded-xl"
        data-testid="voice-consent"
      >
        <h2 id="consent-title" className="text-xl font-bold">
          {t("onboarding.consent.title")}
        </h2>
        <p className="leading-relaxed">{t("onboarding.consent.body")}</p>
        <SpeakButton text={t("onboarding.consent.body")} className="self-start" />
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            size="lg"
            onClick={onAccept}
            data-testid="consent-accept"
            {...bi("onboarding.consent.accept")}
          />
          <Button
            variant="outline"
            size="lg"
            onClick={onDecline}
            data-testid="consent-decline"
            {...bi("onboarding.consent.decline")}
          />
        </div>
      </div>
    </div>
  );
}
