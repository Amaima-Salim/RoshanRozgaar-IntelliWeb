import { Banknote, BadgeCheck, Clock, Hammer, Repeat, ShieldCheck, Star } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { getConfig } from "@/lib/config";
import { SIGNALS, signalPercent, type Signal } from "@/lib/domain/trust";
import { formatKarachiDate } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import type { WorkerTrust } from "@/lib/trust/reputation";
import { StarsStatic } from "./StarRating";

const ICONS: Record<Signal, ReactNode> = {
  onTime: <Clock aria-hidden className="size-5" />,
  quality: <Hammer aria-hidden className="size-5" />,
  fairPrice: <Banknote aria-hidden className="size-5" />,
  respectful: <ShieldCheck aria-hidden className="size-5" />,
};

/**
 * What the next customer reads (Figma 09): rating with count, a grounded summary, tap-signal
 * percentages, jobs completed, repeat customers and recent reviews. "No reviews yet" is never
 * zero stars. The AI badge and the "AI summary of N real customer reviews" label appear only
 * when the phrasing passed validation; otherwise the plain data summary shows without them.
 * There is no "verified" anything here (docs/07 §5).
 */
export async function WorkerTrustPanel({ trust }: { trust: WorkerTrust }) {
  const { t, lang } = await getT();
  const { stats, aiSummary, template, recent } = trust;
  const hasReviews = stats.reviewCount > 0 && stats.avgStars !== null;
  const simulated = getConfig().ai.mode === "fixtures";
  const summary = aiSummary
    ? { text: lang === "ur" ? aiSummary.ur : aiSummary.en, ai: true, count: aiSummary.reviewCount }
    : template
      ? { text: lang === "ur" ? template.ur : template.en, ai: false, count: stats.reviewCount }
      : null;
  const shownSignals = SIGNALS.map((s) => ({ s, pct: signalPercent(stats.rates[s]) })).filter(
    (x): x is { s: Signal; pct: number } => x.pct !== null,
  );

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
      aria-labelledby="trust-heading"
      data-testid="trust-panel"
    >
      <h2 id="trust-heading" className="text-lg font-semibold">
        {t("workerProfile.reputation")}
      </h2>

      {hasReviews ? (
        <p className="flex items-center gap-2 text-xl font-bold" data-testid="trust-rating">
          <Star aria-hidden className="size-6 fill-accent text-accent" />
          <span className="num">
            {t("workerCard.rating", {
              rating: stats.avgStars!.toFixed(1),
              count: stats.reviewCount,
            })}
          </span>
        </p>
      ) : (
        <p className="text-text-muted" data-testid="trust-empty">
          {t("workerProfile.noReviews")}
        </p>
      )}

      {summary ? (
        <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4" data-testid="trust-summary">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-muted">
            {summary.ai ? <Badge kind="ai" /> : null}
            <span data-testid="trust-summary-label">
              {t(summary.ai ? "trust.profile.summaryAi" : "trust.profile.summaryData", {
                count: summary.count,
              })}
            </span>
            {summary.ai && simulated ? (
              <span className="rounded-pill bg-surface px-2.5 py-0.5" data-testid="simulated-ai">
                {t("voiceNote.simulated")}
              </span>
            ) : null}
          </p>
          <p dir="auto" className="num">
            {summary.text}
          </p>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-2">
        <li className="inline-flex items-center gap-1 rounded-pill bg-canvas px-3 py-1">
          <BadgeCheck aria-hidden className="size-4 text-primary" />
          <span className="num" data-testid="jobs-completed">
            {t("workerProfile.jobsDone", { count: stats.jobsCompleted })}
          </span>
        </li>
        {stats.repeatCustomers > 0 ? (
          <li className="inline-flex items-center gap-1 rounded-pill bg-canvas px-3 py-1">
            <Repeat aria-hidden className="size-4 text-primary" />
            <span className="num" data-testid="repeat-customers">
              {t("trust.profile.repeat", { count: stats.repeatCustomers })}
            </span>
          </li>
        ) : null}
      </ul>

      {hasReviews ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{t("trust.profile.signals")}</h3>
          {shownSignals.length ? (
            <ul className="grid gap-2 sm:grid-cols-2" data-testid="trust-signals">
              {shownSignals.map(({ s, pct }) => (
                <li key={s} className="flex items-center gap-2 rounded-lg border border-border p-3">
                  <span className="text-primary">{ICONS[s]}</span>
                  <span className="num">{t(`trust.signal.${s}`, { pct })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{t("trust.profile.signalsFew")}</p>
          )}
        </div>
      ) : null}

      {recent.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{t("trust.profile.recent")}</h3>
          <ul className="flex flex-col gap-3" data-testid="recent-reviews">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                  <StarsStatic value={r.stars} />
                  <span>{t("trust.profile.customer")}</span>
                  <span>· {formatKarachiDate(new Date(r.createdAt), lang)}</span>
                  {r.isSeeded ? <Badge kind="demo" /> : null}
                </div>
                {r.comment ? (
                  <p dir="auto" data-testid="review-text">
                    {r.comment}
                  </p>
                ) : null}
                {r.tags.length ? (
                  <ul className="flex flex-wrap gap-1">
                    {r.tags.map((tag) => (
                      <li key={tag} className="rounded-pill bg-canvas px-2.5 py-0.5 text-sm">
                        {t(`trust.tags.${tag}`)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
