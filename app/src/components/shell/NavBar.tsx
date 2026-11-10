"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";
import { isActive, NAV_ITEMS, type ShellRole } from "./nav-items";
import { SignOutButton } from "./SignOutButton";

/** Tablet/desktop chrome (≥ 768 px): logo on the reading-start side, links, language, account. */
export function NavBar({ role, signedIn }: { role: ShellRole | null; signedIn: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 hidden border-b border-border bg-surface/95 backdrop-blur md:block">
      <div className="mx-auto flex h-18 max-w-content items-center gap-6 px-6">
        <Logo />
        {role ? (
          <nav aria-label={t("nav.main")} className="flex flex-1 items-center gap-1">
            {NAV_ITEMS[role].map(({ href, key, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-touch items-center gap-2 rounded-pill px-4 font-medium",
                    active
                      ? "bg-primary-soft text-primary-strong"
                      : "text-text-muted hover:bg-canvas",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  {t(key)}
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="flex-1" />
        )}
        <LanguageToggle />
        {signedIn ? <SignOutButton /> : null}
      </div>
    </header>
  );
}
