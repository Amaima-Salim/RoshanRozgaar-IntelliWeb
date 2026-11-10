"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/client";
import type { ProfileAnswers } from "@/lib/domain/worker-profile";
import { describeAnswers, type AreaOption } from "./describe";

/** The "profile so far" panel (desktop side panel; phone shows it on the read-back step). */
export function LiveProfile({ answers, areas }: { answers: ProfileAnswers; areas: AreaOption[] }) {
  const { t, tKey, lang } = useI18n();
  const rows = describeAnswers(answers, areas, lang, tKey);
  const any = rows.some((r) => r.value);
  return (
    <section
      aria-labelledby="live-profile-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
      data-testid="live-profile"
    >
      <h2 id="live-profile-title" className="text-lg font-semibold">
        {t("onboarding.live.title")}
      </h2>
      {any ? null : <p className="text-sm text-text-muted">{t("onboarding.live.empty")}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.step} className="flex items-start gap-3">
            {r.value ? (
              <Check aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
            ) : (
              <Circle aria-hidden className="mt-1 size-5 shrink-0 text-border" />
            )}
            <div className="flex min-w-0 flex-col">
              <span className="text-sm text-text-muted">{r.label}</span>
              <span className={cn("font-semibold", !r.value && "text-text-muted")}>
                {r.value ?? (r.step === "photo" ? t("onboarding.readback.photoNone") : "—")}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
