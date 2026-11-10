import { asc } from "drizzle-orm";
import { CustomerOnboardingForm } from "@/components/customer/CustomerOnboardingForm";
import { requireRolePage } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { areas } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("customerOnboarding.title") };
}

/** Customer onboarding: name (prefilled from Google if used), area, language. */
export default async function CustomerOnboardingPage() {
  const user = await requireRolePage("customer");
  const rows = await db
    .select({
      slug: areas.slug,
      nameEn: areas.nameEn,
      nameUr: areas.nameUr,
      lat: areas.lat,
      lng: areas.lng,
    })
    .from(areas)
    .orderBy(asc(areas.nameEn));
  // Phone sign-ins have the number as their name; don't prefill that.
  const prefill = /^[\d\s+-]+$/.test(user.name) ? "" : user.name;
  return <CustomerOnboardingForm areas={rows} initialName={prefill} initialLang={user.language} />;
}
