import { and, avg, count, eq } from "drizzle-orm";
import { ArrowLeft, MessageCircle, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideButtons } from "@/components/guide/GuideButtons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { requireRolePage } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { areas, jobs, users, workerProfiles, workerReputation } from "@/lib/db/schema";
import { formatPkr } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("workerProfile.title") };
}

/** Public worker profile (Figma 09). Exposes only fields a customer may see: no phone, no exact base point. */
export default async function WorkerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRolePage("customer");
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { t, lang } = await getT();

  const [w] = await db
    .select({
      name: users.name,
      nameUr: users.nameUr,
      trade: workerProfiles.trade,
      years: workerProfiles.yearsExperience,
      rate: workerProfiles.indicativeRatePkr,
      basis: workerProfiles.rateBasis,
      areaSlugs: workerProfiles.areaSlugs,
      isDemo: workerProfiles.isSeeded,
      reviewCount: workerReputation.reviewCount,
      avgStars: workerReputation.avgStars,
      jobsCompleted: workerReputation.jobsCompleted,
    })
    .from(workerProfiles)
    .innerJoin(users, eq(users.id, workerProfiles.userId))
    .leftJoin(workerReputation, eq(workerReputation.workerId, workerProfiles.userId))
    .where(and(eq(workerProfiles.userId, id), eq(workerProfiles.onboardingStatus, "complete")));
  if (!w || !w.trade || w.rate === null || w.years === null) notFound();

  const [typical] = await db
    .select({ price: avg(jobs.pricePkr), n: count() })
    .from(jobs)
    .where(and(eq(jobs.workerId, id), eq(jobs.status, "completed")));
  const typicalPkr = typical && typical.n > 0 ? Math.round(Number(typical.price)) : w.rate;

  const areaRows = w.areaSlugs.length ? await db.select().from(areas) : [];
  const areaNames = areaRows
    .filter((a) => w.areaSlugs.includes(a.slug))
    .map((a) => (lang === "ur" ? a.nameUr : a.nameEn));

  const requestId =
    typeof q.request === "string" && /^[0-9a-f-]{36}$/.test(q.request) ? q.request : null;
  const primary = lang === "ur" && w.nameUr ? w.nameUr : w.name;
  const secondary = lang === "ur" ? w.name : w.nameUr;
  const hasReviews = (w.reviewCount ?? 0) > 0 && w.avgStars !== null;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6" data-testid="worker-profile">
      <Link
        href={requestId ? `/c/request/${requestId}` : "/c/request/new"}
        className="inline-flex min-h-touch items-center gap-2 font-medium text-primary"
      >
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("workerProfile.back")}
      </Link>

      <header className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 md:p-8">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-20 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-3xl font-bold text-primary"
          >
            {w.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold md:text-3xl" data-testid="worker-name">
              {primary}
            </h1>
            {secondary ? <p className="text-text-muted">{secondary}</p> : null}
            <p className="text-text-muted">
              {t(`trades.${w.trade}`)} ·{" "}
              {w.years === 1
                ? t("workerProfile.yearsOne")
                : t("workerProfile.years", { years: w.years })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-pill bg-canvas px-3 py-1">
            <Star aria-hidden className="size-4 text-accent" />
            {hasReviews
              ? t("workerCard.rating", { rating: w.avgStars!.toFixed(1), count: w.reviewCount! })
              : t("workerCard.noReviews")}
          </span>
          {w.isDemo ? <Badge kind="demo" /> : null}
        </div>
        <GuideButtons id="workerProfile" />
      </header>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">{t("workerProfile.typicalPrice")}</h2>
        <p className="num text-3xl font-bold" data-testid="typical-price">
          {formatPkr(typicalPkr)}
        </p>
        <p className="text-text-muted">
          {t("workerProfile.typicalPriceHint", {
            basis: t(`workerProfile.basis.${w.basis ?? "per_visit"}`),
          })}
        </p>
      </section>

      {areaNames.length ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">{t("workerProfile.areas")}</h2>
          <ul className="flex flex-wrap gap-2">
            {areaNames.map((n) => (
              <li key={n} className="rounded-pill bg-canvas px-3 py-1">
                {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">{t("workerProfile.reputation")}</h2>
        {hasReviews ? null : <p className="text-text-muted">{t("workerProfile.noReviews")}</p>}
        <p className="text-text-muted">
          {t("workerProfile.jobsDone", { count: w.jobsCompleted ?? 0 })}
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          fullWidth
          disabled
          icon={<MessageCircle aria-hidden />}
          label={t("workerProfile.message")}
          disabledReason={t("workerProfile.messageSoon")}
          data-testid="message-worker"
        />
      </div>
    </article>
  );
}
