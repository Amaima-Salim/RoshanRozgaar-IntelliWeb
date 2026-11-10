import { AppShell } from "@/components/shell/AppShell";
import { requireRolePage } from "@/lib/auth/guards";

/** Server-side role guard for every /c/* page (DECISIONS.md D-39). */
export default async function CustomerLayout({ children }: LayoutProps<"/c">) {
  await requireRolePage("customer");
  return (
    <AppShell role="customer" signedIn wide>
      {children}
    </AppShell>
  );
}
