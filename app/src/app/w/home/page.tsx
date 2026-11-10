import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { CalendarCheck, CircleDot, Inbox, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AvailabilityToggle } from "@/components/worker/AvailabilityToggle";
import { ImproveHint } from "@/components/trust/ImproveHint";
import { loadWorkerTrust } from "@/lib/trust/reputation";
import { requireRolePage } from "@/lib/auth/guards";
import { expireStale } from "@/lib/booking/expiry";
import { db } from "@/lib/db/client";
import { jobs, workerReputation } from "@/lib/db/schema";
import { requestsForWorker } from "@/lib/discovery/worker-requests";
import { formatKarachiDate, formatKarachiTime, karachiDayBounds } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { loadVerification } from "@/lib/verification/service";
import { loadWorkerProfile } from "@/lib/worker/profile";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("nav.work") };
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span aria-hidden className="text-primary">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ children, testId }: { children: ReactNode; testId: string }) => (
  <p className="rounded-lg bg-canvas p-4 text-text-muted" data-testid={testId}>
    {children}
  </p>
);

/** Worker dashboard (Figma 06): availability, today's jobs, requests, reputation. */
export default async function WorkerHomePage() {
  const user = await requireRolePage("worker");
  const profile = await loadWorkerProfile(user.id);
  if (!profile.onboardingComplete) redirect("/w/onboarding");
  const verification = await loadVerification(user.id);

  const { t, lang } = await getT();
  await expireStale();
  const now = new Date();
  const { start, end } = karachiDayBounds(now);
  const [todays, [reputation], openRequests, [nextJob]] = await Promise.all([
    db
      .select({ id: jobs.id, startAt: jobs.startAt, endAt: jobs.endAt, status: jobs.status })
      .from(jobs)
      .where(
        and(
          eq(jobs.workerId, user.id),
          inArray(jobs.status, ["confirmed", "in_progress"]),
          gte(jobs.startAt, start),
          lt(jobs.startAt, end),
        ),
      )
      .orderBy(asc(jobs.startAt)),
    db.select().from(workerReputation).where(eq(workerReputation.workerId, user.id)),
    requestsForWorker(user.id),
    db
      .select({ id: jobs.id, startAt: jobs.startAt, endAt: jobs.endAt, status: jobs.status })
      .from(jobs)
      .where(
        and(
          eq(jobs.workerId, user.id),
          inArray(jobs.status, ["confirmed", "in_progress"]),
          gt(jobs.endAt, now),
        ),
      )
      .orderBy(asc(jobs.startAt))
      .limit(1),
  ]);
  const engagedNow = !!nextJob && nextJob.startAt <= now;
  const name = lang === "ur" ? (user.nameUr ?? user.name) : user.name;
  const trust = await loadWorkerTrust(user.id);
  const hasReviews = !!reputation && reputation.reviewCount > 0 && reputation.avgStars !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{t("workerHome.greeting", { name })}</h1>
        <Link
          href="/w/onboarding?edit=1"
          className="inline-flex min-h-touch items-center font-medium text-primary underline"
        >
          {t("workerHome.editProfile")}
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-3 xl:items-start">
        <div className="flex flex-col gap-6">
          <AvailabilityToggle initial={profile.isAvailable} />
          <Card title={t("verify.homeCard")} icon={<ShieldCheck />}>
            <p data-testid="verify-home-status">{t(`verify.status.${verification.status}`)}</p>
            <Link
              href="/w/verify"
              className="inline-flex min-h-touch items-center font-medium text-primary underline"
            >
              {verification.status === "demo_verified" ? t("verify.homeView") : t("verify.homeCta")}
            </Link>
          </Card>
          <Card title={t("booking.engaged.title")} icon={<CircleDot />}>
            {nextJob ? (
              <div className="flex flex-col gap-2" data-testid="engaged-block">
                <p className="num text-lg font-semibold">
                  {engagedNow
                    ? t("booking.engaged.now", { time: formatKarachiTime(nextJob.endAt, lang) })
                    : t("booking.engaged.next", {
                        when: `${formatKarachiDate(nextJob.startAt, lang)}, ${formatKarachiTime(nextJob.startAt, lang)}`,
                      })}
                </p>
                <Link
                  href={`/w/job/${nextJob.id}`}
                  className="inline-flex min-h-touch items-center font-medium text-primary underline"
                >
                  {t("booking.engaged.view")}
                </Link>
              </div>
            ) : (
              <Empty testId="engaged-empty">{t("booking.engaged.none")}</Empty>
            )}
          </Card>
          <Card title={t("workerHome.reputation.title")} icon={<Star />}>
            {hasReviews ? (
              <p className="num text-lg font-semibold" data-testid="reputation">
                {t("workerHome.reputation.avg", { avg: reputation!.avgStars!.toFixed(1) })} ·{" "}
                {t("workerHome.reputation.reviews", { count: reputation!.reviewCount })}
              </p>
            ) : (
              <Empty testId="reputation-empty">{t("workerHome.reputation.empty")}</Empty>
            )}
            <p className="num text-text-muted" data-testid="reputation-jobs">
              {t("workerProfile.jobsDone", { count: trust.stats.jobsCompleted })}
            </p>
            <ImproveHint stats={trust.stats} />
            <Link
              href="/w/profile"
              className="inline-flex min-h-touch items-center font-medium text-primary underline"
              data-testid="reputation-details"
            >
              {t("trust.worker.title")}
            </Link>
          </Card>
        </div>
        <Card title={t("workerHome.requests.title")} icon={<Inbox />}>
          {openRequests.length === 0 ? (
            <Empty testId="requests-empty">{t("workerHome.requests.empty")}</Empty>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="requests-list">
              {openRequests.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 rounded-lg bg-canvas p-3">
                  <p className="font-semibold">
                    {t(`trades.${r.trade}`)} · {lang === "ur" ? r.areaNameUr : r.areaNameEn}
                  </p>
                  {r.photoMediaId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated media
                    <img
                      src={`/api/media/${r.photoMediaId}`}
                      alt={t("request.photoAlt")}
                      loading="lazy"
                      className="max-h-48 w-full rounded-lg object-contain"
                    />
                  ) : null}
                  {r.summaryText ? (
                    <p dir="auto" className="text-text-muted">
                      {r.summaryText}
                    </p>
                  ) : null}
                  <p className="num text-sm">
                    {t("workerHome.requests.when", {
                      when: `${formatKarachiDate(r.startAt, lang)}, ${formatKarachiTime(r.startAt, lang)}`,
                    })}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t("workerHome.requests.why", {
                      trade: t(`trades.${r.trade}`),
                      km: r.why.distanceKm.toFixed(1),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t("workerHome.schedule.title")} icon={<CalendarCheck />}>
          {todays.length === 0 ? (
            <Empty testId="schedule-empty">{t("workerHome.schedule.empty")}</Empty>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="schedule-list">
              {todays.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/w/job/${j.id}`}
                    className="num block rounded-lg bg-canvas p-3 font-semibold hover:bg-primary-soft"
                  >
                    {formatKarachiTime(j.startAt, lang)} – {formatKarachiTime(j.endAt, lang)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
