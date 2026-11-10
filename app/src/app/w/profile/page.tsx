import { redirect } from "next/navigation";
import { ImproveHint } from "@/components/trust/ImproveHint";
import { WorkerTrustPanel } from "@/components/trust/WorkerTrustPanel";
import { requireRolePage } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { loadWorkerTrust } from "@/lib/trust/reputation";
import { loadWorkerProfile } from "@/lib/worker/profile";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("trust.worker.profileTitle") };
}

/** The worker's own view of their reputation: exactly what customers see, plus a real-signal hint. */
export default async function WorkerProfilePage() {
  const user = await requireRolePage("worker");
  const profile = await loadWorkerProfile(user.id);
  if (!profile.onboardingComplete) redirect("/w/onboarding");
  const { t, lang } = await getT();
  const trust = await loadWorkerTrust(user.id);
  const name = lang === "ur" && user.nameUr ? user.nameUr : user.name;

  return (
    <article
      className="mx-auto flex w-full max-w-3xl flex-col gap-6"
      data-testid="worker-own-profile"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">{t("trust.worker.profileTitle")}</h1>
        <p className="text-text-muted">{name}</p>
      </header>
      <ImproveHint stats={trust.stats} />
      <WorkerTrustPanel trust={trust} />
    </article>
  );
}
