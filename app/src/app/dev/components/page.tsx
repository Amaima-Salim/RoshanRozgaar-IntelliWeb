import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { Gallery } from "./Gallery";

/**
 * Dev-only component gallery (Phase 0 task 9). Without `?frame` it shows the
 * gallery inside two frames, 360 and 1440 wide; with `?frame=1` it renders the
 * components directly. 404 in production.
 */
export default async function ComponentsPage({ searchParams }: PageProps<"/dev/components">) {
  // Dev only; E2E runs a production build and sets RR_E2E=1 to audit the gallery (DECISIONS.md D-43).
  const config = getConfig();
  if (config.isProduction && !config.isE2E) notFound();
  const { t } = await getT();
  const { frame } = await searchParams;

  if (frame) {
    return (
      <AppShell role="worker" signedIn={false} wide>
        <h1 className="mb-6 text-2xl font-bold">{t("dev.galleryTitle")}</h1>
        <Gallery />
      </AppShell>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t("dev.galleryTitle")}</h1>
      <div className="flex flex-wrap items-start gap-6">
        <figure className="flex flex-col gap-2">
          <figcaption className="num text-sm text-text-muted">360 × 800</figcaption>
          <iframe
            title="360"
            src="/dev/components?frame=1"
            className="h-[800px] w-[360px] rounded-lg border border-border bg-bg"
          />
        </figure>
        <figure className="flex flex-col gap-2">
          <figcaption className="num text-sm text-text-muted">1440 × 900 (shown at 50%)</figcaption>
          <div className="h-[450px] w-[720px] overflow-hidden rounded-lg border border-border">
            <iframe
              title="1440"
              src="/dev/components?frame=1"
              className="h-[900px] w-[1440px] origin-top-left scale-50 bg-bg rtl:origin-top-right"
            />
          </div>
        </figure>
      </div>
    </div>
  );
}
