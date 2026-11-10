import { AppShell } from "@/components/shell/AppShell";
import { requireRolePage } from "@/lib/auth/guards";

/** Server-side role guard for every /w/* page (DECISIONS.md D-39). */
export default async function WorkerLayout({ children }: LayoutProps<"/w">) {
  await requireRolePage("worker");
  return (
    <AppShell role="worker" signedIn wide>
      {children}
    </AppShell>
  );
}
