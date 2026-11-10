"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";

/** On every screen (docs/03 §8). Flips lang + dir; keeps the user on the same page. */
export function LanguageToggle({ className }: { className?: string }) {
  const { t, other } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const res = await fetch("/api/me/language", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: other }),
      }).catch(() => null);
      if (res?.ok) router.refresh();
    });

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      lang={other}
      aria-label={`${t("language.toggleLabel")}: ${t("language.switchTo")}`}
      data-testid="language-toggle"
      className={cn(
        "inline-flex min-h-touch items-center gap-2 rounded-pill border border-border bg-surface px-4 font-medium hover:bg-primary-soft",
        "disabled:opacity-60",
        className,
      )}
    >
      <Languages aria-hidden className="size-5 text-primary" />
      <span>{t("language.switchTo")}</span>
    </button>
  );
}
