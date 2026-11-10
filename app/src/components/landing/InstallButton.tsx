"use client";

import { Download } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";

type InstallPrompt = Event & { prompt: () => Promise<void> };

function subscribeToDisplayMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Offers native installation when available, otherwise explains the browser's install options. */
export function InstallButton() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const helpId = useId();
  const standalone = useSyncExternalStore(subscribeToDisplayMode, isStandalone, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setShowHelp((visible) => !visible);
      return;
    }
    setShowHelp(false);
    setPrompt(null);
    try {
      await prompt.prompt();
    } catch {
      setShowHelp(true);
    }
  }

  if (installed || standalone) return null;
  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-sm sm:items-end">
      <button
        type="button"
        onClick={() => void install()}
        aria-expanded={showHelp}
        aria-controls={helpId}
        className="inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-strong"
      >
        <Download aria-hidden className="size-4" />
        {t("home.install")}
      </button>
      <p id={helpId} hidden={!showHelp} className="text-sm text-text-muted" role="status">
        {t("home.installHelp")}
      </p>
    </div>
  );
}
