"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { SpeakButton } from "@/components/ui/SpeakButton";
import {
  OPTIONAL_STEPS,
  STEP_IDS,
  isStepAnswered,
  missingSteps,
  type ProfileAnswers,
  type StepId,
} from "@/lib/domain/worker-profile";
import { useI18n } from "@/lib/i18n/client";
import type { AreaOption } from "./describe";
import { LiveProfile } from "./LiveProfile";
import { ReadBack } from "./ReadBack";
import { AreasStep, PhotoStep, RateStep, ScheduleStep, TradeStep, YearsStep } from "./steps";

const READBACK = STEP_IDS.length; // index of the read-back screen

/**
 * Tap-first worker interview (docs/01 §3 O1, docs/03 §5): one question per step, icon answers,
 * numbered progress, a way back, a read-back with Yes / Change. There is no form field except
 * the optional photo picker. Desktop: steps rail · question · live profile. Phone: one step per
 * screen with a sticky Next.
 */
export function OnboardingFlow({
  initial,
  areas,
}: {
  initial: ProfileAnswers;
  areas: AreaOption[];
}) {
  const { t, tKey, bi } = useI18n();
  const router = useRouter();
  const [answers, setAnswers] = useState<ProfileAnswers>(initial);
  const [index, setIndex] = useState(0);
  const [returnToReadback, setReturnToReadback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const onReadback = index === READBACK;
  const step: StepId | null = onReadback ? null : STEP_IDS[index]!;
  const patch = (p: Partial<ProfileAnswers>) => setAnswers((a) => ({ ...a, ...p }));

  // Move focus to the new question so screen readers announce it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [index]);

  const goto = (i: number) => setIndex(Math.max(0, Math.min(READBACK, i)));
  const next = () => {
    if (returnToReadback) {
      setReturnToReadback(false);
      goto(READBACK);
    } else goto(index + 1);
  };
  const back = () => {
    if (returnToReadback) {
      setReturnToReadback(false);
      goto(READBACK);
    } else goto(index - 1);
  };
  const edit = (target: StepId) => {
    setReturnToReadback(true);
    goto(STEP_IDS.indexOf(target));
  };

  const missing = missingSteps(answers);
  const canNext = step === null || OPTIONAL_STEPS.includes(step) || isStepAnswered(answers, step);

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/worker/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trade: answers.trade,
          yearsExperience: answers.yearsExperience,
          areaSlugs: answers.areaSlugs,
          indicativeRatePkr: answers.indicativeRatePkr,
          rateBasis: answers.rateBasis,
          weekdays: answers.weekdays,
          dayParts: answers.dayParts,
          photoMediaId: answers.photoMediaId,
        }),
      });
      if (!res.ok) throw new Error("save");
      router.replace("/w/home");
      router.refresh();
    } catch {
      setSaving(false);
      setSaveError(true);
    }
  };

  const question = step ? t(`onboarding.q.${step}`) : t("onboarding.readback.title");
  const hint = step ? t(`onboarding.hint.${step}`) : null;

  const nav = (
    <>
      {index > 0 ? (
        <Button
          variant="outline"
          size="lg"
          onClick={back}
          data-testid="back"
          {...bi("onboarding.back")}
        />
      ) : null}
      {onReadback ? (
        <Button
          size="lg"
          loading={saving}
          disabled={missing.length > 0}
          disabledReason={
            missing.length > 0
              ? t("onboarding.readback.missing", {
                  steps: missing.map((m) => tKey(`onboarding.stepNames.${m}`)).join(", "),
                })
              : undefined
          }
          onClick={save}
          data-testid="save-profile"
          {...bi("onboarding.readback.yes")}
        />
      ) : (
        <>
          {step && OPTIONAL_STEPS.includes(step) && !isStepAnswered(answers, step) ? (
            <Button
              variant="secondary"
              size="lg"
              onClick={next}
              data-testid="skip"
              {...bi("onboarding.skip")}
            />
          ) : null}
          <Button
            size="lg"
            disabled={!canNext}
            onClick={next}
            data-testid="next"
            {...bi("onboarding.next")}
          />
        </>
      )}
    </>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[14rem_minmax(0,1fr)_20rem] xl:items-start">
      {/* Steps rail: desktop only; phone uses the numbered dots below. */}
      <nav aria-label={t("onboarding.stepsLabel")} className="hidden xl:block">
        <ol className="flex flex-col gap-2">
          {STEP_IDS.map((id, i) => {
            const done = isStepAnswered(answers, id);
            const current = i === index;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => goto(i)}
                  className={cn(
                    "flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-start font-medium",
                    current ? "bg-primary-soft text-primary-strong" : "hover:bg-canvas",
                  )}
                >
                  <span
                    className={cn(
                      "num flex size-8 shrink-0 items-center justify-center rounded-pill border-2 text-sm",
                      done ? "border-primary bg-primary text-on-primary" : "border-border",
                    )}
                  >
                    {done ? <Check aria-hidden className="size-4" /> : i + 1}
                  </span>
                  {tKey(`onboarding.stepNames.${id}`)}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-current={onReadback ? "step" : undefined}
              onClick={() => goto(READBACK)}
              className={cn(
                "flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-start font-medium",
                onReadback ? "bg-primary-soft text-primary-strong" : "hover:bg-canvas",
              )}
            >
              <span className="num flex size-8 shrink-0 items-center justify-center rounded-pill border-2 border-border text-sm">
                {STEP_IDS.length + 1}
              </span>
              {t("onboarding.stepNames.review")}
            </button>
          </li>
        </ol>
      </nav>

      <section
        aria-labelledby="question"
        className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 md:p-8"
        data-testid="question-panel"
      >
        <ol
          aria-label={`${index + 1} / ${READBACK + 1}`}
          className="flex items-center justify-center gap-2 xl:hidden"
        >
          {Array.from({ length: READBACK + 1 }, (_, i) => (
            <li
              key={i}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "num flex size-8 items-center justify-center rounded-pill border-2 text-sm font-semibold",
                i === index
                  ? "border-primary bg-primary text-on-primary"
                  : i < index
                    ? "border-primary text-primary"
                    : "border-border text-text-muted",
              )}
            >
              {i + 1}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1
              id="question"
              ref={heading}
              tabIndex={-1}
              className="text-2xl font-bold leading-relaxed outline-none md:text-3xl"
              data-testid="question"
            >
              {question}
            </h1>
            {hint ? <p className="text-text-muted">{hint}</p> : null}
          </div>
          <SpeakButton text={question} />
        </div>

        {step === "trade" ? <TradeStep answers={answers} onChange={patch} /> : null}
        {step === "years" ? <YearsStep answers={answers} onChange={patch} /> : null}
        {step === "areas" ? <AreasStep answers={answers} areas={areas} onChange={patch} /> : null}
        {step === "rate" ? <RateStep answers={answers} onChange={patch} /> : null}
        {step === "schedule" ? <ScheduleStep answers={answers} onChange={patch} /> : null}
        {step === "photo" ? <PhotoStep answers={answers} onChange={patch} /> : null}
        {onReadback ? <ReadBack answers={answers} areas={areas} onEdit={edit} /> : null}

        {saveError ? (
          <p role="alert" className="font-semibold text-danger" data-testid="save-error">
            {t("onboarding.readback.saveError")}
          </p>
        ) : null}

        {/* Phone: sticky footer above the tabs. Desktop: inline. */}
        <div className="md:hidden" aria-hidden style={{ height: "5rem" }} />
        <div
          className={cn(
            "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex gap-3 border-t border-border bg-surface px-4 py-3",
            "md:static md:justify-end md:border-0 md:bg-transparent md:p-0",
            "[&>button]:flex-1 md:[&>button]:flex-none",
          )}
        >
          {nav}
        </div>
      </section>

      <div className={cn(onReadback ? "block" : "hidden xl:block")}>
        <LiveProfile answers={answers} areas={areas} />
      </div>
    </div>
  );
}
