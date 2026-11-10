"use client";

import {
  CalendarClock,
  CircleCheck,
  Hammer,
  MapPin,
  MessageCircle,
  Play,
  Star,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { cn } from "@/components/ui/cn";
import type { JobView } from "@/lib/booking/job-view";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { useOnline } from "@/lib/hooks/use-online";
import { formatPkr } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";

const POLL_MS = 4000;
const CANCEL_REASONS = ["plans_changed", "cannot_make_it", "price_or_time", "other"] as const;

type TransitionName = "start" | "request-complete" | "confirm-complete" | "cancel";
type Fail = {
  ok: false;
  error: { code: string; current?: { version: number; status: string } };
};

const knownEvent = (e: string): e is "confirmed" | "in_progress" | "completed" | "cancelled" =>
  ["confirmed", "in_progress", "completed", "cancelled"].includes(e);

/**
 * One job, as the customer or the worker sees it (Figma 12): status, role actions, timeline.
 * Polls by `version` (4 s while visible and online). Commit buttons are disabled offline and a
 * conflict refetches the latest instead of overwriting (docs/02 §4, docs/09).
 */
export function JobScreen({ initial }: { initial: JobView }) {
  const { t, lang } = useI18n();
  const online = useOnline();
  const [job, setJob] = useState<JobView>(initial);
  const [busy, setBusy] = useState<TransitionName | null>(null);
  const [notice, setNotice] = useState<"changed" | "failed" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number] | null>(null);
  // The newest version we know of; updated only where a fresh job arrives (never during render).
  const version = useRef(initial.version);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/jobs/${initial.id}?since=${version.current}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as
      { ok: true; data: { unchanged: true } | { unchanged: false; job: JobView } } | { ok: false };
    if (json.ok && !json.data.unchanged) {
      version.current = json.data.job.version;
      setJob(json.data.job);
    }
    return json.ok;
  }, [initial.id]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void refetch().catch(() => undefined);
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refetch]);

  const act = async (action: TransitionName, why?: string) => {
    setBusy(action);
    setNotice(null);
    try {
      // Refetch before acting so the version we send is the latest one we can know.
      await refetch().catch(() => undefined);
      const res = await fetch(`/api/jobs/${initial.id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          version: version.current,
          ...(why ? { reason: why } : {}),
        }),
      });
      const json = (await res.json()) as { ok: true } | Fail;
      if (!json.ok && json.error.code === "CONFLICT_STATE") setNotice("changed");
      else if (!json.ok) setNotice("failed");
      await refetch().catch(() => undefined);
      if (json.ok) {
        setCancelling(false);
        setReason(null);
      }
    } catch {
      setNotice("failed");
    } finally {
      setBusy(null);
    }
  };

  const start = new Date(job.startAt);
  const when = `${formatKarachiDate(start, lang)}, ${formatKarachiTime(start, lang)} – ${formatKarachiTime(new Date(job.endAt), lang)}`;
  const name = lang === "ur" && job.otherNameUr ? job.otherNameUr : job.otherName;
  const area = lang === "ur" ? job.areaNameUr : job.areaNameEn;
  const isWorker = job.role === "worker";
  const base = isWorker ? "/w" : "/c";
  const live = job.status === "confirmed" || job.status === "in_progress";
  const canCancel = job.status === "confirmed";

  const statusKind =
    job.status === "completed" ? "success" : job.status === "cancelled" ? "failed" : "pending";
  const spoken = `${t(`booking.job.status.${job.status}`)}. ${t("booking.job.price")}: ${formatPkr(job.pricePkr)}. ${t("booking.job.when")}: ${when}.`;

  return (
    <div
      className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      data-testid="job"
      data-status={job.status}
      data-version={job.version}
    >
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold md:text-3xl">
              {t("booking.job.with", { trade: t(`trades.${job.trade}`), name })}
            </h1>
            <StatusPill
              status={statusKind}
              label={t(`booking.job.status.${job.status}`)}
              className="text-base"
            />
          </div>
          <SpeakButton text={spoken} className="self-start" />
        </header>

        {notice === "changed" ? (
          <p
            role="status"
            className="rounded-lg bg-info-soft p-3 text-info"
            data-testid="job-changed"
          >
            {t("booking.job.changed")}
          </p>
        ) : null}
        {notice === "failed" ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft p-3 text-danger"
            data-testid="job-failed"
          >
            {t("booking.job.actionFailed")}
          </p>
        ) : null}
        {!online ? (
          <p
            role="status"
            className="rounded-lg bg-danger-soft p-3 text-danger"
            data-testid="job-offline"
          >
            {t("booking.job.offline")}
          </p>
        ) : null}

        <dl className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
          <Fact icon={<CalendarClock />} label={t("booking.job.when")}>
            <span className="num font-semibold">{when}</span>
          </Fact>
          <Fact icon={<Wallet />} label={t("booking.job.price")}>
            <span className="num text-xl font-bold" data-testid="job-price">
              {formatPkr(job.pricePkr)}
            </span>
          </Fact>
          <Fact icon={<MapPin />} label={t("booking.job.area")}>
            {area}
          </Fact>
          {isWorker ? (
            <Fact icon={<MapPin />} label={t("booking.job.address")}>
              <span dir="auto" data-testid="job-address">
                {job.addressText ?? t("booking.job.addressMissing")}
              </span>
            </Fact>
          ) : null}
          <Fact icon={<Hammer />} label={t("booking.job.note")}>
            <span dir="auto">{job.summaryText ?? t("booking.job.noNote")}</span>
          </Fact>
        </dl>

        <section className="flex flex-col gap-3" aria-label={t("booking.job.title")}>
          {job.status === "confirmed" && isWorker ? (
            <Button
              size="lg"
              fullWidth
              icon={<Play aria-hidden className="size-5 rtl:-scale-x-100" />}
              label={t("booking.job.start")}
              loading={busy === "start"}
              disabled={!online || busy !== null}
              onClick={() => void act("start")}
              data-testid="job-start"
            />
          ) : null}

          {job.status === "in_progress" && isWorker && !job.completionRequested ? (
            <Button
              size="lg"
              fullWidth
              icon={<CircleCheck aria-hidden className="size-5" />}
              label={t("booking.job.requestComplete")}
              loading={busy === "request-complete"}
              disabled={!online || busy !== null}
              onClick={() => void act("request-complete")}
              data-testid="job-request-complete"
            />
          ) : null}
          {job.status === "in_progress" && isWorker && job.completionRequested ? (
            <p className="rounded-lg bg-info-soft p-3 text-info" data-testid="job-waiting-customer">
              {t("booking.job.waitingCustomer")}
            </p>
          ) : null}

          {job.status === "in_progress" && !isWorker && job.completionRequested ? (
            <>
              <p className="rounded-lg bg-accent-soft p-3 font-medium">
                {t("booking.job.customerAsked", { name })}
              </p>
              <Button
                size="lg"
                fullWidth
                icon={<CircleCheck aria-hidden className="size-5" />}
                label={t("booking.job.confirmComplete")}
                loading={busy === "confirm-complete"}
                disabled={!online || busy !== null}
                onClick={() => void act("confirm-complete")}
                data-testid="job-confirm-complete"
              />
            </>
          ) : null}
          {job.status === "in_progress" && !isWorker && !job.completionRequested ? (
            <p className="rounded-lg bg-canvas p-3 text-text-muted">
              {t("booking.job.waitingWorker")}
            </p>
          ) : null}

          {job.status === "completed" ? (
            <p className="rounded-lg bg-primary-soft p-3 font-medium text-primary-strong">
              {t("booking.job.completedNote")}
            </p>
          ) : null}
          {job.status === "completed" && !isWorker ? (
            job.reviewed ? (
              <p className="rounded-lg bg-canvas p-3 font-medium" data-testid="job-reviewed">
                {t("trust.cta.done")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-text-muted">{t("trust.cta.rateHint")}</p>
                <Button
                  asChild
                  size="lg"
                  fullWidth
                  icon={<Star aria-hidden className="size-5" />}
                  label={t("trust.cta.rate")}
                >
                  <Link href={`/c/job/${job.id}/review`} data-testid="job-rate">
                    {t("trust.cta.rate")}
                  </Link>
                </Button>
              </div>
            )
          ) : null}
          {job.status === "cancelled" ? (
            <p className="rounded-lg bg-canvas p-3" data-testid="job-cancelled-note">
              {t("booking.job.cancelledNote")} {t("booking.job.windowFree")}
            </p>
          ) : null}

          {canCancel && !cancelling ? (
            <Button
              variant="outline"
              fullWidth
              icon={<XCircle aria-hidden className="size-5" />}
              label={t("booking.job.cancel")}
              disabled={!online || busy !== null}
              onClick={() => setCancelling(true)}
              data-testid="job-cancel"
            />
          ) : null}
          {canCancel && cancelling ? (
            <fieldset
              className="flex flex-col gap-3 rounded-xl border-2 border-danger/40 p-4"
              data-testid="cancel-form"
            >
              <legend className="px-2 font-semibold">{t("booking.job.cancelWhy")}</legend>
              <div className="flex flex-wrap gap-2">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={reason === r}
                    onClick={() => setReason(r)}
                    className={cn(
                      "min-h-touch rounded-pill border-2 px-4 font-medium",
                      reason === r
                        ? "border-danger bg-danger-soft text-danger"
                        : "border-border hover:bg-canvas",
                    )}
                    data-testid={`cancel-reason-${r}`}
                  >
                    {t(`booking.job.cancelReasons.${r}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  label={t("booking.job.cancelConfirm")}
                  loading={busy === "cancel"}
                  disabled={!online || busy !== null || !reason}
                  onClick={() => reason && void act("cancel", reason)}
                  data-testid="job-cancel-confirm"
                />
                <Button
                  variant="outline"
                  label={t("booking.job.keep")}
                  onClick={() => {
                    setCancelling(false);
                    setReason(null);
                  }}
                />
              </div>
            </fieldset>
          ) : null}

          {live ? <p className="text-sm text-text-muted">{t("booking.job.paymentNote")}</p> : null}

          <Button
            asChild
            variant="secondary"
            fullWidth
            label={t("booking.job.openChat")}
            icon={<MessageCircle aria-hidden className="size-5" />}
          >
            <Link href={`${base}/chat/${job.conversationId}`}>{t("booking.job.openChat")}</Link>
          </Button>
        </section>
      </div>

      <aside className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 lg:self-start">
        <h2 className="text-lg font-semibold">{t("booking.job.timeline")}</h2>
        <ol className="flex flex-col gap-3" data-testid="job-timeline">
          {job.events.map((e, i) => {
            const label: MessageKey =
              e.reason === "request-complete"
                ? "booking.job.event.completion_requested"
                : knownEvent(e.toStatus)
                  ? (`booking.job.event.${e.toStatus}` as MessageKey)
                  : "booking.job.event.confirmed";
            const at = new Date(e.at);
            return (
              <li key={i} className="border-s-4 border-primary ps-3">
                <p className="font-semibold">{t(label)}</p>
                <p className="num text-sm text-text-muted">
                  {formatKarachiDate(at, lang)}, {formatKarachiTime(at, lang)} ·{" "}
                  {t(`booking.job.by.${e.actorRole}`)}
                </p>
                {e.toStatus === "cancelled" && e.reason ? (
                  <p className="text-sm">
                    {(CANCEL_REASONS as readonly string[]).includes(e.reason)
                      ? t(
                          `booking.job.cancelReasons.${e.reason as (typeof CANCEL_REASONS)[number]}`,
                        )
                      : e.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    // A <dl> may only contain groups of dt/dd, so the icon lives inside the <dt>.
    <div className="flex min-w-0 flex-col">
      <dt className="flex items-center gap-2 text-sm text-text-muted">
        <span aria-hidden className="text-primary [&_svg]:size-5">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="ps-7">{children}</dd>
    </div>
  );
}
