import type { MessageKey } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import {
  DAY_PART_KEYS,
  WEEKDAY_ORDER,
  type ProfileAnswers,
  type StepId,
} from "@/lib/domain/worker-profile";

export type AreaOption = { slug: string; nameEn: string; nameUr: string };
type TKey = (key: string, vars?: Record<string, string | number>) => string;

export type Row = { step: StepId; label: string; value: string | null };

/** One display string per answered step; `null` while unanswered. Shared by the live panel and read-back. */
export function describeAnswers(
  a: ProfileAnswers,
  areas: AreaOption[],
  lang: Lang,
  tKey: TKey,
): Row[] {
  const areaName = (slug: string) => {
    const area = areas.find((x) => x.slug === slug);
    return area ? (lang === "ur" ? area.nameUr : area.nameEn) : slug;
  };
  const years =
    a.yearsExperience === null
      ? null
      : a.yearsExperience === 0
        ? tKey("onboarding.yearsNew")
        : a.yearsExperience === 1
          ? tKey("onboarding.yearsOne")
          : tKey("onboarding.yearsValue", { n: a.yearsExperience });
  const rate =
    a.indicativeRatePkr !== null && a.rateBasis
      ? `${tKey("onboarding.rateValue", { amount: a.indicativeRatePkr.toLocaleString("en-US") })} · ${tKey(`onboarding.basis.${a.rateBasis}`)}`
      : null;
  const schedule =
    a.weekdays.length > 0 && a.dayParts.length > 0
      ? `${WEEKDAY_ORDER.filter((d) => a.weekdays.includes(d))
          .map((d) => tKey(`days.${d}`))
          .join(lang === "ur" ? "، " : ", ")} · ${DAY_PART_KEYS.filter((p) =>
          a.dayParts.includes(p),
        )
          .map((p) => tKey(`onboarding.dayParts.${p}`))
          .join(lang === "ur" ? "، " : ", ")}`
      : null;
  const rows: Row[] = [
    {
      step: "trade",
      label: tKey("onboarding.readback.rows.trade"),
      value: a.trade ? tKey(`trades.${a.trade}`) : null,
    },
    { step: "years", label: tKey("onboarding.readback.rows.years"), value: years },
    {
      step: "areas",
      label: tKey("onboarding.readback.rows.areas"),
      value: a.areaSlugs.length
        ? a.areaSlugs.map(areaName).join(lang === "ur" ? "، " : ", ")
        : null,
    },
    { step: "rate", label: tKey("onboarding.readback.rows.rate"), value: rate },
    { step: "schedule", label: tKey("onboarding.readback.rows.schedule"), value: schedule },
    {
      step: "photo",
      label: tKey("onboarding.readback.rows.photo"),
      value: a.photoMediaId ? tKey("onboarding.readback.photoAdded") : null,
    },
  ];
  return rows;
}

export type { MessageKey };
