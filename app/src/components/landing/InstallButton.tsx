"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

type InstallPrompt = Event & { prompt: () => Promise<void> };

/** Shows only when the browser offers to install the PWA (Chrome/Edge/Android). */
export function InstallButton() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void prompt.prompt();
        setPrompt(null);
      }}
      className="inline-flex min-h-touch items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm font-semibold hover:bg-primary-soft"
    >
      <Download aria-hidden className="size-4" />
      {t("home.install")}
    </button>
  );
}
