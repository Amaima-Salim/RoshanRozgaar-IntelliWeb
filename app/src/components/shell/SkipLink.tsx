"use client";

import { useI18n } from "@/lib/i18n/client";

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main"
      className="sr-only start-0 top-0 focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
    >
      {t("app.skipToContent")}
    </a>
  );
}
