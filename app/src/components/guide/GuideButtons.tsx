"use client";

import { Languages } from "lucide-react";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { cn } from "@/components/ui/cn";
import { GUIDE_KEYS, guideAudioSrc, type GuideId } from "@/lib/guide";
import { createT } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

/**
 * "Listen" in the page language plus a second button for the other language, so a worker who
 * reads Urdu and a customer who prefers English can each hear the same instructions. Each
 * button plays the recorded file when there is one, else the browser voice, else hides.
 */
export function GuideButtons({ id, className }: { id: GuideId; className?: string }) {
  const { t, lang, other } = useI18n();
  const key = GUIDE_KEYS[id];
  const text = t(key);
  const otherText = createT(other).t(key);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid={`guide-${id}`}>
      <SpeakButton
        lang={lang}
        text={text}
        src={guideAudioSrc(id, lang)}
        label={t("guide.listen")}
      />
      <SpeakButton
        lang={other}
        text={otherText}
        src={guideAudioSrc(id, other)}
        label={createT(other).t("guide.listen")}
      />
      <details className="text-sm text-text-muted">
        <summary className="inline-flex min-h-touch cursor-pointer items-center gap-1 font-medium text-primary">
          <Languages aria-hidden className="size-4" />
          {t("guide.title")}
        </summary>
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-canvas p-3 text-text">
          <p lang={lang}>{text}</p>
          <p
            lang={other}
            dir={other === "ur" ? "rtl" : "ltr"}
            className="border-t border-border pt-2"
          >
            {otherText}
          </p>
        </div>
      </details>
    </div>
  );
}
