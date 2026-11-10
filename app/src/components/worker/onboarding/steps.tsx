"use client";

import { compressImage } from "@/lib/media/compress-client";
import { Camera, Minus, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Tile } from "@/components/ui/Tile";
import { TRADE_ICONS } from "@/components/worker/trade-icons";
import {
  DAY_PART_KEYS,
  RATE_BASES,
  RATE_CHIPS,
  RATE_MAX,
  RATE_MIN,
  RATE_STEP,
  TRADES,
  WEEKDAY_ORDER,
  YEARS_MAX,
  type DayPart,
  type ProfileAnswers,
  type Trade,
} from "@/lib/domain/worker-profile";
import { useI18n } from "@/lib/i18n/client";
import type { AreaOption } from "./describe";

type Change = (patch: Partial<ProfileAnswers>) => void;
const toggle = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

export function TradeStep({ answers, onChange }: { answers: ProfileAnswers; onChange: Change }) {
  const { bi } = useI18n();
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {TRADES.map((trade: Trade) => {
        const Icon = TRADE_ICONS[trade];
        const { label, caption } = bi(`trades.${trade}` as const);
        return (
          <li key={trade}>
            <Tile
              className="w-full"
              icon={<Icon />}
              label={label}
              caption={caption}
              selected={answers.trade === trade}
              onClick={() => onChange({ trade })}
              data-testid={`trade-${trade}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function BigStepper({
  value,
  display,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
  minusDisabled,
  plusDisabled,
  testId,
}: {
  value: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
  minusDisabled: boolean;
  plusDisabled: boolean;
  testId: string;
}) {
  const btn =
    "flex size-20 items-center justify-center rounded-pill border-2 border-primary bg-surface text-primary hover:bg-primary-soft disabled:border-border disabled:text-border";
  return (
    <div className="flex items-center justify-center gap-5" data-testid={testId}>
      <button
        type="button"
        className={btn}
        onClick={onMinus}
        disabled={minusDisabled}
        aria-label={minusLabel}
      >
        <Minus aria-hidden className="size-9" />
      </button>
      <output
        aria-live="polite"
        className="num min-w-36 text-center text-3xl font-bold"
        data-testid={`${testId}-value`}
        title={value}
      >
        {display}
      </output>
      <button
        type="button"
        className={btn}
        onClick={onPlus}
        disabled={plusDisabled}
        aria-label={plusLabel}
      >
        <Plus aria-hidden className="size-9" />
      </button>
    </div>
  );
}

export function YearsStep({ answers, onChange }: { answers: ProfileAnswers; onChange: Change }) {
  const { t, tKey } = useI18n();
  const years = answers.yearsExperience;
  const display =
    years === null
      ? "—"
      : years === 0
        ? tKey("onboarding.yearsNew")
        : years === 1
          ? tKey("onboarding.yearsOne")
          : tKey("onboarding.yearsValue", { n: years });
  return (
    <BigStepper
      testId="years"
      value={String(years ?? "")}
      display={display}
      minusLabel={t("onboarding.yearsLess")}
      plusLabel={t("onboarding.yearsMore")}
      minusDisabled={years === 0}
      plusDisabled={years !== null && years >= YEARS_MAX}
      onMinus={() => onChange({ yearsExperience: years === null ? 0 : Math.max(0, years - 1) })}
      onPlus={() =>
        onChange({ yearsExperience: years === null ? 1 : Math.min(YEARS_MAX, years + 1) })
      }
    />
  );
}

export function AreasStep({
  answers,
  areas,
  onChange,
}: {
  answers: ProfileAnswers;
  areas: AreaOption[];
  onChange: Change;
}) {
  const { lang } = useI18n();
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {areas.map((area) => (
        <li key={area.slug}>
          <Tile
            className="w-full"
            icon={<span className="num text-2xl font-bold">{area.nameEn.slice(0, 4)}</span>}
            label={lang === "ur" ? area.nameUr : area.nameEn}
            caption={lang === "ur" ? area.nameEn : area.nameUr}
            selected={answers.areaSlugs.includes(area.slug)}
            onClick={() => onChange({ areaSlugs: toggle(answers.areaSlugs, area.slug) })}
            data-testid={`area-${area.slug}`}
          />
        </li>
      ))}
    </ul>
  );
}

export function RateStep({ answers, onChange }: { answers: ProfileAnswers; onChange: Change }) {
  const { t, tKey } = useI18n();
  const rate = answers.indicativeRatePkr;
  const money = (n: number) => tKey("onboarding.rateValue", { amount: n.toLocaleString("en-US") });
  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RATE_CHIPS.map((chip) => (
          <li key={chip}>
            <button
              type="button"
              aria-pressed={rate === chip}
              onClick={() => onChange({ indicativeRatePkr: chip })}
              data-testid={`rate-${chip}`}
              className={cn(
                "num min-h-16 w-full rounded-lg border-2 px-3 text-lg font-bold",
                rate === chip
                  ? "border-[3px] border-primary bg-primary-soft"
                  : "border-border bg-surface",
              )}
            >
              {money(chip)}
            </button>
          </li>
        ))}
      </ul>
      {rate !== null ? (
        <BigStepper
          testId="rate"
          value={String(rate)}
          display={money(rate)}
          minusLabel={t("onboarding.rateLess")}
          plusLabel={t("onboarding.rateMore")}
          minusDisabled={rate - RATE_STEP < RATE_MIN}
          plusDisabled={rate + RATE_STEP > RATE_MAX}
          onMinus={() => onChange({ indicativeRatePkr: Math.max(RATE_MIN, rate - RATE_STEP) })}
          onPlus={() => onChange({ indicativeRatePkr: Math.min(RATE_MAX, rate + RATE_STEP) })}
        />
      ) : null}
      <ul className="grid grid-cols-3 gap-3">
        {RATE_BASES.map((basis) => (
          <li key={basis}>
            <button
              type="button"
              aria-pressed={answers.rateBasis === basis}
              onClick={() => onChange({ rateBasis: basis })}
              data-testid={`basis-${basis}`}
              className={cn(
                "min-h-16 w-full rounded-lg border-2 px-2 font-semibold",
                answers.rateBasis === basis
                  ? "border-[3px] border-primary bg-primary-soft"
                  : "border-border bg-surface",
              )}
            >
              {tKey(`onboarding.basis.${basis}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScheduleStep({ answers, onChange }: { answers: ProfileAnswers; onChange: Change }) {
  const { tKey } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {WEEKDAY_ORDER.map((day) => (
          <li key={day}>
            <button
              type="button"
              aria-pressed={answers.weekdays.includes(day)}
              onClick={() => onChange({ weekdays: toggle(answers.weekdays, day) })}
              data-testid={`day-${day}`}
              className={cn(
                "min-h-16 w-full rounded-lg border-2 px-1 text-sm font-semibold",
                answers.weekdays.includes(day)
                  ? "border-[3px] border-primary bg-primary-soft"
                  : "border-border bg-surface",
              )}
            >
              {tKey(`onboarding.days.${day}`)}
            </button>
          </li>
        ))}
      </ul>
      <ul className="grid gap-3 sm:grid-cols-3">
        {DAY_PART_KEYS.map((part: DayPart) => (
          <li key={part}>
            <Tile
              className="w-full"
              icon={
                <span aria-hidden className="text-2xl">
                  {part === "morning" ? "☀" : part === "afternoon" ? "🌤" : "🌙"}
                </span>
              }
              label={tKey(`onboarding.dayParts.${part}`)}
              caption={tKey(`onboarding.dayPartTimes.${part}`)}
              selected={answers.dayParts.includes(part)}
              onClick={() => onChange({ dayParts: toggle(answers.dayParts, part) })}
              data-testid={`part-${part}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PhotoStep({ answers, onChange }: { answers: ProfileAnswers; onChange: Change }) {
  const { t, bi } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFailed(false);
    try {
      const blob = await compressImage(file);
      const form = new FormData();
      form.set("file", blob, "photo.jpg");
      const res = await fetch("/api/worker/photo", { method: "POST", body: form });
      const json = (await res.json()) as { ok: boolean; data?: { mediaId: string } };
      if (!res.ok || !json.ok || !json.data) throw new Error("upload");
      setPreview(URL.createObjectURL(blob));
      onChange({ photoMediaId: json.data.mediaId });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {answers.photoMediaId && preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview
        <img
          src={preview}
          alt={t("onboarding.photoAlt")}
          className="size-40 rounded-pill object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-40 items-center justify-center rounded-pill bg-primary-soft text-primary"
        >
          <Camera className="size-14" />
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void pick(e.target.files?.[0])}
        data-testid="photo-input"
      />
      <Button
        variant="outline"
        size="lg"
        loading={busy}
        icon={<Camera aria-hidden />}
        onClick={() => input.current?.click()}
        {...bi(answers.photoMediaId ? "onboarding.photoChange" : "onboarding.photoChoose")}
      />
      {answers.photoMediaId ? (
        <button
          type="button"
          className="inline-flex min-h-touch items-center gap-2 font-medium text-danger underline"
          onClick={() => {
            setPreview(null);
            onChange({ photoMediaId: null });
          }}
        >
          <Trash2 aria-hidden className="size-5" />
          {t("onboarding.photoRemove")}
        </button>
      ) : null}
      {failed ? (
        <p role="alert" className="font-semibold text-danger" data-testid="photo-error">
          {t("onboarding.photoError")}
        </p>
      ) : null}
    </div>
  );
}
