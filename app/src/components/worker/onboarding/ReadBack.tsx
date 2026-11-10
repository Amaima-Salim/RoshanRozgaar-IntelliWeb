"use client";

import { ChevronRight, Pencil } from "lucide-react";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/client";
import type { ProfileAnswers, StepId } from "@/lib/domain/worker-profile";
import { describeAnswers, type AreaOption } from "./describe";

/** Read-back card (docs/03 §4): key/value rows, spoken on request, tap a row to change it. */
export function ReadBack({
  answers,
  areas,
  onEdit,
}: {
  answers: ProfileAnswers;
  areas: AreaOption[];
  onEdit: (step: StepId) => void;
}) {
  const { t, tKey, lang } = useI18n();
  const rows = describeAnswers(answers, areas, lang, tKey);
  const spoken = rows
    .filter((r) => r.value)
    .map((r) => `${r.label}: ${r.value}`)
    .join(". ");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-muted">{t("onboarding.readback.hint")}</p>
        <SpeakButton text={spoken} />
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.step}>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start hover:bg-primary-soft/50"
              data-testid={`readback-${r.step}`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-text-muted">{r.label}</span>
                <span className={cn("font-semibold", !r.value && "text-danger")}>
                  {r.value ??
                    (r.step === "photo"
                      ? t("onboarding.readback.photoNone")
                      : t("onboarding.readback.notAnswered"))}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                <Pencil aria-hidden className="size-4" />
                {t("onboarding.readback.edit")}
                <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
