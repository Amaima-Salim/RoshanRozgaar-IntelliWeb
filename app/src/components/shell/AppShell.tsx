import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { BottomTabs } from "./BottomTabs";
import { NavBar } from "./NavBar";
import type { ShellRole } from "./nav-items";
import { SkipLink } from "./SkipLink";
import { TopBar } from "./TopBar";

/**
 * Responsive chrome (docs/03 §2). One page per route:
 * - phone (< 768): TopBar + content + sticky footer (primary action) + BottomTabs
 * - tablet/desktop (≥ 768): NavBar + centered content (max 1200)
 */
export function AppShell({
  role,
  signedIn,
  title,
  backHref,
  footer,
  wide = false,
  children,
}: {
  role: ShellRole | null;
  signedIn: boolean;
  title?: string;
  backHref?: string;
  /** Primary actions. Sticky above the tabs on phone so they're always visible; inline on desktop. */
  footer?: ReactNode;
  /** Use the full 1200 px container (multi-column screens); otherwise max 720. */
  wide?: boolean;
  children: ReactNode;
}) {
  const hasTabs = role !== null;
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <NavBar role={role} signedIn={signedIn} />
      <TopBar title={title} backHref={backHref} signedIn={signedIn} />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full flex-1 px-4 py-6 md:px-6 md:py-10",
          wide ? "max-w-content" : "max-w-3xl",
          hasTabs && "pb-24 md:pb-10",
          footer ? "pb-44 md:pb-10" : null,
        )}
      >
        {children}
        {footer ? (
          <div className="mt-8 hidden md:flex md:justify-end md:gap-3">{footer}</div>
        ) : null}
      </main>
      {footer ? (
        <div
          className={cn(
            "fixed inset-x-0 z-20 flex flex-col gap-2 border-t border-border bg-surface px-4 py-3 md:hidden",
            hasTabs
              ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]"
              : "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
          )}
          data-testid="sticky-footer"
        >
          {footer}
        </div>
      ) : null}
      {hasTabs ? <BottomTabs role={role} /> : null}
    </div>
  );
}
