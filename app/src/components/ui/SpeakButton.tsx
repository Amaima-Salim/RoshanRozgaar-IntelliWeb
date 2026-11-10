"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

const SPEECH_LANG = { ur: "ur-PK", en: "en-US" } as const;

/** True when the browser has a speech voice for this language (Urdu voices are rare). */
function hasVoice(lang: "ur" | "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang));
}

/**
 * Plays a pre-generated prompt (`src`), or reads `text` aloud with the browser voice when there
 * is no file. Renders nothing when neither can be spoken (docs/03 §4, docs/04 §2): the text and
 * icons on screen always carry the meaning.
 */
export function SpeakButton({
  src,
  text,
  className,
}: {
  src?: string | null;
  text?: string | null;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fileBroken, setFileBroken] = useState(false);
  const [voice, setVoice] = useState(false);

  // Voices load asynchronously in most browsers.
  useEffect(() => {
    if (!text) return;
    const check = () => setVoice(hasVoice(lang));
    check();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
  }, [text, lang]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  const useFile = !!src && !fileBroken;
  const useVoice = !useFile && !!text && voice;
  if (!useFile && !useVoice) return null;

  const stop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
  };

  const toggle = () => {
    if (playing) {
      stop();
      return;
    }
    if (useFile) {
      if (!audioRef.current) {
        const audio = new Audio(src!);
        audio.addEventListener("ended", () => setPlaying(false));
        audio.addEventListener("error", () => setFileBroken(true));
        audioRef.current = audio;
      }
      audioRef.current.play().then(
        () => setPlaying(true),
        () => setFileBroken(true),
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text!);
    utterance.lang = SPEECH_LANG[lang];
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      className={cn(
        "inline-flex min-h-touch items-center gap-2 rounded-pill border-2 border-primary px-4 font-medium text-primary hover:bg-primary-soft",
        className,
      )}
    >
      {playing ? (
        <Square aria-hidden className="size-5" />
      ) : (
        <Volume2 aria-hidden className="size-5 rtl:-scale-x-100" />
      )}
      {playing ? t("speak.stop") : t("speak.play")}
    </button>
  );
}
