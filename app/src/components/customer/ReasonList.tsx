"use client";

import { formatKarachiTime } from "@/lib/domain/time";
import type { Reason } from "@/lib/domain/ranking";
import { useI18n } from "@/lib/i18n/client";

/** Structured reasons → plain sentences in the page language (docs/02 §6). */
export function ReasonList({ reasons }: { reasons: Reason[] }) {
  const { t, lang } = useI18n();
  const text = (r: Reason): string => {
    switch (r.kind) {
      case "distance":
        return t("results.reasonDistance", { km: r.km.toFixed(1) });
      case "free":
        return t("results.reasonFree", { time: formatKarachiTime(r.startAt, lang) });
      case "rating":
        return t("results.reasonRating", { rating: r.stars.toFixed(1), count: r.count });
      case "noReviews":
        return t("results.reasonNoReviews");
      case "experience":
        return r.years === 1
          ? t("results.reasonYearsOne")
          : t("results.reasonExperience", { years: r.years });
      case "price":
        return t(
          r.fit === "within_budget"
            ? "results.reasonPriceWithin"
            : r.fit === "above_budget"
              ? "results.reasonPriceAbove"
              : "results.reasonPriceNoBudget",
          { pkr: new Intl.NumberFormat("en-PK").format(r.pkr) },
        );
    }
  };
  return (
    <ul className="flex flex-col gap-1 text-sm text-text-muted" aria-label={t("results.why")}>
      {reasons.map((r) => (
        <li key={r.kind} className="flex gap-2">
          <span aria-hidden>•</span>
          <span>{text(r)}</span>
        </li>
      ))}
    </ul>
  );
}
