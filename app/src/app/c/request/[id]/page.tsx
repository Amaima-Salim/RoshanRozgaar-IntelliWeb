import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ResultsView } from "@/components/customer/ResultsView";
import { requireRolePage } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import { findCandidates } from "@/lib/discovery/candidates";
import { DEFAULT_RADIUS_KM } from "@/lib/domain/ranking-config";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("results.title") };
}

/** Results for one request: the same service the candidates API uses, rendered on the server. */
export default async function RequestResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRolePage("customer");
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), eq(requests.customerId, user.id)));
  if (!req) notFound();

  const asked = Number(Array.isArray(q.radius) ? q.radius[0] : q.radius);
  const radiusKm = asked >= 1 && asked <= 30 ? asked : DEFAULT_RADIUS_KM;
  const result = await findCandidates(req, { radiusKm });

  const ids = result.candidates.map((c) => c.workerId);
  const names = ids.length
    ? await db
        .select({ id: users.id, nameUr: users.nameUr })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  return (
    <ResultsView
      requestId={req.id}
      trade={req.trade}
      result={result}
      nameUr={Object.fromEntries(names.map((n) => [n.id, n.nameUr]))}
    />
  );
}
