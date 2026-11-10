import { asc } from "drizzle-orm";
import { cookies } from "next/headers";
import { RequestForm } from "@/components/customer/RequestForm";
import { requireRolePage } from "@/lib/auth/guards";
import { AREA_COOKIE } from "@/lib/customer/area";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/client";
import { areas } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("request.title") };
}

export default async function NewRequestPage() {
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
  const jar = await cookies();
  const saved = jar.get(AREA_COOKIE)?.value ?? null;
  const defaultArea = rows.some((a) => a.slug === saved) ? saved : null;
  void user;
  return <RequestForm areas={rows} defaultAreaSlug={defaultArea} aiMode={getConfig().ai.mode} />;
}
