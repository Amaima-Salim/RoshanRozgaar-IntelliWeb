"use client";

import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { useSpeech } from "@/components/voice/useSpeech";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

/**
 * Plays a pre-generated prompt (`src`), else the server Urdu/English voice model when
 * `voiceModel` allows it for this text, else the browser voice. Renders nothing when none of
 * them can speak (docs/03 §4, docs/04 §2): the text and icons on screen always carry the meaning.
 */
export function SpeakButton({
  src,
  text,
  lang: forcedLang,
  label,
  voiceModel = false,
  className,
}: {
  src?: string | null;
  text?: string | null;
  /** Language of `text`/`src` when it differs from the page language (the "In English" guide). */
  lang?: "ur" | "en";
  /** Overrides the visible "Listen" label. */
  label?: string;
  /** Allow the server voice model. Never for text with names, phones or addresses. */
  voiceModel?: boolean;
  className?: string;
}) {
  const { t, lang: pageLang } = useI18n();
  const lang = forcedLang ?? pageLang;
  const speech = useSpeech(lang, text, { src, voiceModel });
  if (!speech.canSpeak) return null;

  const busy = speech.playing || speech.loading;
  return (
    <button
      type="button"
      onClick={() => (busy ? speech.stop() : void speech.play())}
      aria-pressed={busy}
      aria-busy={speech.loading}
      className={cn(
        "inline-flex min-h-touch items-center gap-2 rounded-pill border-2 border-primary px-4 font-medium text-primary hover:bg-primary-soft",
        className,
      )}
    >
      {speech.loading ? (
        <LoaderCircle aria-hidden className="size-5 animate-spin" />
      ) : speech.playing ? (
        <Square aria-hidden className="size-5" />
      ) : (
        <Volume2 aria-hidden className="size-5 rtl:-scale-x-100" />
      )}
      {busy ? t("speak.stop") : (label ?? t("speak.play"))}
    </button>
  );
}
