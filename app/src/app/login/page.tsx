import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { LoginPanel } from "@/components/login/LoginPanel";
import { getSession, homeFor } from "@/lib/auth/guards";
import { getConfig } from "@/lib/config";
import { DEMO_CUSTOMERS, DEMO_WORKER } from "@/lib/db/seed/data";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("login.title") };
}

/** Sign-in (Figma 02). Phase 0: demo phone login + one-tap demo accounts only. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const role = params.role === "worker" ? "worker" : "customer";
  const next = typeof params.next === "string" ? params.next : null;

  const user = await getSession();
  if (user) redirect(user.role ? homeFor(user.role) : "/");

  const demoAccounts = [
    ...DEMO_CUSTOMERS.map((c) => ({
      name: c.name,
      nameUr: c.nameUr,
      phone: c.phone,
      role: "customer" as const,
    })),
    {
      name: DEMO_WORKER.name,
      nameUr: DEMO_WORKER.nameUr,
      phone: DEMO_WORKER.phone,
      role: "worker" as const,
    },
  ];

  return (
    <AppShell role={null} signedIn={false} backHref="/" wide>
      <div className="mx-auto w-full max-w-4xl">
        <LoginPanel
          role={role}
          next={next}
          demoCode={getConfig().auth.mockOtpCode}
          demoAccounts={demoAccounts}
        />
      </div>
    </AppShell>
  );
}
