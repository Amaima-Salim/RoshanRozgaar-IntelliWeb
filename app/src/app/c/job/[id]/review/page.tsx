import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/trust/ReviewForm";
import { requireRolePage } from "@/lib/auth/guards";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/client";
import { jobs, reviews, users } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("trust.review.title") };
}

/** Review capture for a completed job (Figma 14). Customer of that job only; one review per job. */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRolePage("customer");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { t, lang } = await getT();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job || job.customerId !== user.id) notFound();
  const [worker] = await db
    .select({ name: users.name, nameUr: users.nameUr })
    .from(users)
    .where(eq(users.id, job.workerId));
  const [existing] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.jobId, id));
  const name = lang === "ur" && worker?.nameUr ? worker.nameUr : (worker?.name ?? "");

  const blocked = job.status !== "completed" ? "notReady" : existing ? "already" : null;

  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-6" data-testid="review-page">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">{t("trust.review.title")}</h1>
        <p className="text-text-muted">{t("trust.review.intro", { name })}</p>
      </header>
      {blocked ? (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <p className="text-lg" data-testid={`review-${blocked}`}>
            {t(`trust.review.${blocked}`)}
          </p>
          <Link
            href={`/c/job/${id}`}
            className="inline-flex min-h-touch items-center font-medium text-primary"
          >
            {t("trust.review.backToJob")}
          </Link>
        </section>
      ) : (
        <ReviewForm jobId={id} workerName={name} aiMode={getConfig().ai.mode} />
      )}
    </article>
  );
}
