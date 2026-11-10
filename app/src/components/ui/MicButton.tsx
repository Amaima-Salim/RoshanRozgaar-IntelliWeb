"use client";

import { AlertCircle, LoaderCircle, Mic, Square } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

export type MicState = "idle" | "listening" | "processing" | "error";

/**
 * Tap-to-start / tap-to-stop mic (docs/03 §4). Phase 0: visual states only;
 * recording and transcription are wired in Phase 2.
 */
export function MicButton({
  state,
  onPress,
  className,
}: {
  state: MicState;
  onPress?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const label = t(`mic.${state}`);
  const Icon =
    state === "listening"
      ? Square
      : state === "processing"
        ? LoaderCircle
        : state === "error"
          ? AlertCircle
          : Mic;
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        onClick={onPress}
        disabled={state === "processing"}
        aria-label={label}
        aria-pressed={state === "listening"}
        className={cn(
          "relative flex size-20 items-center justify-center rounded-pill text-on-primary transition-colors",
          state === "error" ? "bg-danger" : "bg-primary hover:bg-primary-strong",
          "disabled:cursor-wait",
        )}
      >
        {state === "listening" ? (
          <span aria-hidden className="absolute inset-0 animate-ping rounded-pill bg-primary/40" />
        ) : null}
        <Icon
          aria-hidden
          className={cn("relative size-9", state === "processing" && "animate-spin")}
        />
      </button>
      <p
        aria-live="polite"
        className={cn("text-center text-sm font-medium", state === "error" && "text-danger")}
      >
        {label}
      </p>
    </div>
  );
}
