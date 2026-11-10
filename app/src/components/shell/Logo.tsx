"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";

/** Brand mark: never mirrored in RTL (docs/03 §3). */
export function Logo() {
  const { t } = useI18n();
  return (
    <Link href="/" className="inline-flex min-h-touch items-center gap-2 font-bold text-primary">
      <svg aria-hidden viewBox="0 0 32 32" className="size-8 shrink-0">
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <path
          d="M9 22V10h7a4 4 0 0 1 0 8h-7m7 0 5 4"
          stroke="#fff"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="24" cy="9" r="3" fill="var(--color-accent)" />
      </svg>
      <span className="text-lg">{t("app.name")}</span>
    </Link>
  );
}
