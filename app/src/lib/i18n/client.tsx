"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createT, type Lang, type MessageKey } from "./index";

type I18nValue = { lang: Lang; other: Lang } & ReturnType<typeof createT> & {
    /** Label in the current language + caption in the other one (docs/03 §1.5). */
    bi: (
      key: MessageKey,
      vars?: Record<string, string | number>,
    ) => { label: string; caption: string };
  };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  // Marks the page interactive; E2E waits on it instead of racing hydration.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  const value = useMemo(() => {
    const other: Lang = lang === "ur" ? "en" : "ur";
    const current = createT(lang);
    const alt = createT(other);
    return {
      lang,
      other,
      ...current,
      bi: (key: MessageKey, vars?: Record<string, string | number>) => ({
        label: current.t(key, vars),
        caption: alt.t(key, vars),
      }),
    };
  }, [lang]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
