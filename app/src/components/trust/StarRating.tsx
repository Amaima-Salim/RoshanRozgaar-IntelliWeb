"use client";

import { Star } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";

/** Big tap-target star picker (radio group, keyboard and screen-reader friendly). */
export function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (stars: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("trust.review.starsLabel")}
      className="flex gap-2"
      dir="ltr"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("trust.review.star", { count: n })}
          onClick={() => onChange(n)}
          className={cn(
            "flex size-14 items-center justify-center rounded-lg border-2 md:size-16",
            n <= value ? "border-accent bg-accent-soft" : "border-border bg-surface",
          )}
          data-testid={`star-${n}`}
        >
          <Star
            aria-hidden
            className={cn("size-9", n <= value ? "fill-accent text-accent" : "text-text-muted")}
          />
        </button>
      ))}
    </div>
  );
}

/** Read-only stars for review lists (a number is always shown next to them elsewhere). */
export function StarsStatic({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <span
      role="img"
      aria-label={t("trust.profile.stars", { count: value })}
      className="inline-flex"
      dir="ltr"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("size-4", n <= value ? "fill-accent text-accent" : "text-border")}
        />
      ))}
    </span>
  );
}
