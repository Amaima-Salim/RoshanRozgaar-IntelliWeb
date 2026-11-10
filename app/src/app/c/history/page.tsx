import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { requireRolePage } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { jobs, requests, users } from "@/lib/db/schema";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("booking.bookings.title") };
}

/** The customer's bookings: every job they confirmed, newest first. */
export default async function BookingsPage() {
  const user = await requireRolePage("customer");
  const { t, lang } = await getT();
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      pricePkr: jobs.pricePkr,
      startAt: jobs.startAt,
      trade: requests.trade,
      workerName: users.name,
      workerNameUr: users.nameUr,
    })
    .from(jobs)
    .innerJoin(requests, eq(requests.id, jobs.requestId))
    .innerJoin(users, eq(users.id, jobs.workerId))
    .where(eq(jobs.customerId, user.id))
    .orderBy(desc(jobs.startAt));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold md:text-3xl">{t("booking.bookings.title")}</h1>
      {rows.length === 0 ? (
        <EmptyState
          title={t("booking.bookings.empty")}
          action={
            <Button asChild label={t("booking.bookings.emptyAction")}>
              <Link href="/c/request/new">{t("booking.bookings.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="bookings-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/c/job/${r.id}`}
                className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:bg-canvas"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold">
                    {t(`trades.${r.trade}`)} ·{" "}
                    {lang === "ur" && r.workerNameUr ? r.workerNameUr : r.workerName}
                  </span>
                  <Badge kind={r.status === "completed" ? "free" : "engaged"} />
                </span>
                <span className="num text-text-muted">
                  {formatKarachiDate(r.startAt, lang)}, {formatKarachiTime(r.startAt, lang)} ·{" "}
                  {formatPkr(r.pricePkr)} · {t(`booking.job.status.${r.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
