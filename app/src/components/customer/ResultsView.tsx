"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { GuideButtons } from "@/components/guide/GuideButtons";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { WorkerCard } from "@/components/ui/WorkerCard";
import type { CandidatesResult } from "@/lib/discovery/candidates";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";
import { ReasonList } from "./ReasonList";

const CandidateMap = dynamic(() => import("./CandidateMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full" />,
});

type Props = {
  requestId: string;
  trade: CandidatesResult["candidates"][number]["trade"];
  result: CandidatesResult;
  nameUr: Record<string, string | null>;
};

/** Ranked list with reasons, plus the map on desktop / a Map-List switch on phones (Figma 08). */
export function ResultsView({ requestId, trade, result, nameUr }: Props) {
  const { t, bi, lang } = useI18n();
  const [view, setView] = useState<"list" | "map">("list");
  const [picked, setPicked] = useState<string | null>(null);
  const start = new Date(result.startAt);
  const when = `${formatKarachiDate(start, lang)}, ${formatKarachiTime(start, lang)}`;
  const pins = useMemo(
    () =>
      result.candidates.map((c) => ({
        id: c.workerId,
        label: c.name,
        lat: c.approx.lat,
        lng: c.approx.lng,
      })),
    [result.candidates],
  );
  const pick = useCallback((id: string) => {
    setPicked(id);
    document.getElementById(`cand-${id}`)?.scrollIntoView({ block: "nearest" });
  }, []);

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold md:text-3xl">{t("results.title")}</h1>
      <p className="text-text-muted" data-testid="results-summary">
        {t("results.summary", { trade: t(`trades.${trade}`), when, km: result.radiusKm })}
      </p>
      <GuideButtons id="results" />
    </header>
  );

  if (result.noMatch) {
    const wider = result.noMatch.widerRadiusKm;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <div data-testid="no-match">
          <EmptyState
            title={t("results.noMatchTitle")}
            body={t("results.noMatchBody", {
              trade: t(`trades.${trade}`),
              km: result.radiusKm,
            })}
            action={
              <div className="flex flex-wrap justify-center gap-3">
                {wider ? (
                  <Button asChild label={null} variant="primary">
                    <Link
                      href={`/c/request/${requestId}?radius=${wider}`}
                      data-testid="widen-radius"
                    >
                      {t("results.widen", { km: wider })}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild label={null} variant="outline">
                  <Link href="/c/request/new" data-testid="change-time">
                    {t("results.changeTime")}
                  </Link>
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const list = (
    <ul className="flex flex-col gap-4" data-testid="results-list">
      {result.candidates.map((c) => (
        <li
          key={c.workerId}
          id={`cand-${c.workerId}`}
          className={cn(
            "flex flex-col gap-3 rounded-lg border-2 bg-surface p-3",
            picked === c.workerId ? "border-primary" : "border-transparent",
          )}
          data-testid="candidate"
        >
          <WorkerCard
            name={c.name}
            nameUr={nameUr[c.workerId]}
            trade={c.trade}
            indicativeRatePkr={c.indicativeRatePkr}
            rating={c.avgStars === null ? null : { avg: c.avgStars, count: c.reviewCount }}
            distanceKm={c.distanceKm}
            freeAt={start}
            jobsCompleted={c.jobsCompleted}
            bestSignal={c.bestSignal}
            isSeeded={c.isDemo}
            className="border-0 p-0"
          />
          <ReasonList reasons={c.reasons} />
          <Button asChild label={null} variant="outline">
            <Link href={`/c/workers/${c.workerId}?request=${requestId}`} data-testid="view-worker">
              {bi("results.view").label}
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
  const map = (
    <div className="flex flex-col gap-2 md:h-full">
      <CandidateMap center={result.center} radiusKm={result.radiusKm} pins={pins} onPick={pick} />
      <p className="text-sm text-text-muted">{t("results.mapNote")}</p>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {header}
      <p className="font-semibold" data-testid="results-count">
        {result.candidates.length === 1
          ? t("results.countOne")
          : t("results.count", { count: result.candidates.length })}
      </p>
      <div className="flex gap-2 md:hidden" role="group" aria-label={t("results.title")}>
        {(["list", "map"] as const).map((v) => (
          <Button
            key={v}
            variant={view === v ? "primary" : "outline"}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            data-testid={`switch-${v}`}
            label={t(`results.${v}`)}
          />
        ))}
      </div>
      {/* Desktop: list and map side by side. Phone: one at a time. */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn(view === "map" && "max-md:hidden")}>{list}</div>
        <div
          className={cn(
            "md:sticky md:top-4 md:self-start md:h-[34rem]",
            view === "list" && "max-md:hidden",
          )}
        >
          {map}
        </div>
      </div>
    </div>
  );
}
