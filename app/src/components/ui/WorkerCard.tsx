"use client";

import { BadgeCheck, Clock, MapPin, Star } from "lucide-react";
import { formatKarachiTime } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "./Badge";
import { cn } from "./cn";

export type WorkerCardProps = {
  name: string;
  nameUr?: string | null;
  trade: "electrician" | "plumber" | "ac_technician" | "carpenter" | "mechanic";
  indicativeRatePkr: number;
  /** null = no reviews yet; never rendered as zero stars (BR-P6). */
  rating: { avg: number; count: number } | null;
  distanceKm: number;
  freeAt: Date;
  /** Jobs finished through the app; shown only when above zero. */
  jobsCompleted?: number;
  /** Strongest tap signal with enough answers (D-58), e.g. 92% on time. */
  bestSignal?: {
    signal: "onTime" | "quality" | "fairPrice" | "respectful";
    percent: number;
  } | null;
  isSeeded?: boolean;
  className?: string;
};

/** Static presentational card (Phase 0); data wiring comes in Phase 3. */
export function WorkerCard({
  name,
  nameUr,
  trade,
  indicativeRatePkr,
  rating,
  distanceKm,
  freeAt,
  jobsCompleted,
  bestSignal,
  isSeeded,
  className,
}: WorkerCardProps) {
  const { t, lang } = useI18n();
  const primaryName = lang === "ur" && nameUr ? nameUr : name;
  const secondaryName = lang === "ur" ? name : nameUr;
  return (
    <article className={cn("flex gap-4 rounded-lg border border-border bg-surface p-4", className)}>
      <span
        aria-hidden
        className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-xl font-bold text-primary"
      >
        {name.charAt(0)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{primaryName}</h3>
            {secondaryName ? (
              <p className="truncate text-sm text-text-muted">{secondaryName}</p>
            ) : null}
            <p className="text-sm text-text-muted">{t(`trades.${trade}`)}</p>
          </div>
          <p className="text-end font-bold">
            {t("workerCard.from", { price: formatPkr(indicativeRatePkr) })}
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 text-sm">
          <li className="inline-flex items-center gap-1 rounded-pill bg-canvas px-2.5 py-1">
            <Star aria-hidden className="size-4 text-accent" />
            {rating ? (
              <span>
                {t("workerCard.rating", { rating: rating.avg.toFixed(1), count: rating.count })}
              </span>
            ) : (
              <span>{t("workerCard.noReviews")}</span>
            )}
          </li>
          <li className="inline-flex items-center gap-1 rounded-pill bg-canvas px-2.5 py-1">
            <Clock aria-hidden className="size-4 text-primary" />
            {t("workerCard.freeAt", { time: formatKarachiTime(freeAt, lang) })}
          </li>
          <li className="inline-flex items-center gap-1 rounded-pill bg-canvas px-2.5 py-1">
            <MapPin aria-hidden className="size-4 text-primary" />
            {t("workerCard.kmAway", { km: distanceKm.toFixed(1) })}
          </li>
          {jobsCompleted ? (
            <li className="inline-flex items-center gap-1 rounded-pill bg-canvas px-2.5 py-1">
              <BadgeCheck aria-hidden className="size-4 text-primary" />
              {t("workerProfile.jobsDone", { count: jobsCompleted })}
            </li>
          ) : null}
          {bestSignal ? (
            <li
              className="inline-flex items-center gap-1 rounded-pill bg-canvas px-2.5 py-1"
              data-testid="card-signal"
            >
              {t(`trust.signal.${bestSignal.signal}`, { pct: bestSignal.percent })}
            </li>
          ) : null}
          {isSeeded ? (
            <li>
              <Badge kind="demo" />
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}
