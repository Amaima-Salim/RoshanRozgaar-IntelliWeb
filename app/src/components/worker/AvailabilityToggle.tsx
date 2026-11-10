"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/client";

/**
 * The big "are you free?" switch. Shows the new state only after the server confirmed it
 * (docs/02 §1: no optimistic commits); on failure it keeps the old state and says so.
 */
export function AvailabilityToggle({ initial }: { initial: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const flip = async () => {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch("/api/worker/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isAvailable: !on }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { isAvailable: boolean } };
      if (!res.ok || !json.ok || !json.data) throw new Error("toggle");
      setOn(json.data.isAvailable);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="availability-title"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="availability-title" className="text-lg font-semibold">
        {t("workerHome.availability.title")}
      </h2>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={flip}
        data-testid="availability-toggle"
        className={cn(
          "flex min-h-24 w-full items-center justify-between gap-4 rounded-xl border-[3px] px-5 text-start text-xl font-bold transition-colors disabled:opacity-70",
          on ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-canvas",
        )}
      >
        <span>
          {pending
            ? t("workerHome.availability.saving")
            : on
              ? t("workerHome.availability.on")
              : t("workerHome.availability.off")}
        </span>
        <span
          aria-hidden
          className={cn(
            "relative h-10 w-[4.5rem] shrink-0 rounded-pill transition-colors",
            on ? "bg-primary" : "bg-border",
          )}
        >
          <span
            className={cn(
              "absolute top-1 size-8 rounded-pill bg-surface shadow transition-all",
              on ? "start-9" : "start-1",
            )}
          />
        </span>
      </button>
      <p className="flex flex-wrap items-center gap-2 text-text-muted" aria-live="polite">
        {on ? <Badge kind="free" /> : <Badge kind="engaged" />}
        {on ? t("workerHome.availability.hintOn") : t("workerHome.availability.hintOff")}
      </p>
      {failed ? (
        <p role="alert" className="font-semibold text-danger" data-testid="availability-error">
          {t("workerHome.availability.error")}
        </p>
      ) : null}
    </section>
  );
}
