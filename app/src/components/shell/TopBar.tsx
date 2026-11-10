"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";
import { SignOutButton } from "./SignOutButton";

/** Phone chrome (< 768 px): back + title + language (docs/03 §2). */
export function TopBar({
  title,
  backHref,
  signedIn,
}: {
  title?: string;
  backHref?: string;
  signedIn: boolean;
}) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur md:hidden">
      <div className="flex h-16 items-center gap-2 px-4">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t("nav.back")}
            className="inline-flex size-touch shrink-0 items-center justify-center rounded-pill hover:bg-canvas"
          >
            {/* Directional icon: mirrored in RTL */}
            <ChevronLeft aria-hidden className="size-6 rtl:-scale-x-100" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1 truncate">
          {title ? <h1 className="truncate text-lg font-semibold">{title}</h1> : <Logo />}
        </div>
        <LanguageToggle className="px-3" />
        {signedIn ? <SignOutButton compact /> : null}
      </div>
    </header>
  );
}
