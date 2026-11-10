import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/worker/onboarding/OnboardingFlow";
import { requireRolePage } from "@/lib/auth/guards";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/client";
import { areas } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";
import { loadWorkerProfile } from "@/lib/worker/profile";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("onboarding.title") };
}

/** Worker onboarding (Figma 04, 05): tap-first interview, no conventional form. */
export default async function WorkerOnboardingPage({ searchParams }: PageProps<"/w/onboarding">) {
  const user = await requireRolePage("worker");
  const [profile, areaRows] = await Promise.all([
    loadWorkerProfile(user.id),
    db
      .select({ slug: areas.slug, nameEn: areas.nameEn, nameUr: areas.nameUr })
      .from(areas)
      .orderBy(asc(areas.nameEn)),
  ]);
  const editing = (await searchParams).edit === "1";
  if (profile.onboardingComplete && !editing) redirect("/w/home");
  return <OnboardingFlow initial={profile.answers} areas={areaRows} aiMode={getConfig().ai.mode} />;
}
