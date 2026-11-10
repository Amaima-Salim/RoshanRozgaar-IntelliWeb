import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { RoleChooser } from "@/components/landing/RoleChooser";
import { getSession, homeFor } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

/** Landing + role choice (Figma 01). */
export default async function LandingPage() {
  const [user, { t }] = await Promise.all([getSession(), getT()]);
  if (user?.role) redirect(homeFor(user.role));

  return (
    <AppShell role={null} signedIn={!!user} wide>
      <section className="flex flex-col gap-8 md:gap-12">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
          <h1 className="text-3xl font-bold text-primary md:text-5xl">{t("landing.title")}</h1>
          <p className="text-lg text-text-muted">{t("landing.subtitle")}</p>
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <h2 className="text-center text-xl font-semibold">{t("landing.chooseRole")}</h2>
          {user ? (
            <p className="text-center text-sm text-text-muted">
              {t("landing.signedInAs", { name: user.name })}
            </p>
          ) : null}
          <RoleChooser mode={user ? "assign" : "link"} />
        </div>
      </section>
    </AppShell>
  );
}
