"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

/** Plays a pre-generated prompt. Renders nothing when there is no audio to play (docs/03 §4). */
export function SpeakButton({ src, className }: { src?: string | null; className?: string }) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => () => audioRef.current?.pause(), []);

  if (!src || broken) return null;

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(src);
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("error", () => setBroken(true));
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      audio.play().then(
        () => setPlaying(true),
        () => setBroken(true),
      );
    }
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
