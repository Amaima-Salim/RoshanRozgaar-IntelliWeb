"use client";

import {
  CalendarClock,
  CircleCheck,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { WorkerCard } from "@/components/ui/WorkerCard";
import type { PublicCandidate } from "@/lib/discovery/candidates";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { useOnline } from "@/lib/hooks/use-online";
import type { MessageKey } from "@/lib/i18n";

export type AcceptSummary = {
  offerId: string;
  /** Who the viewer is booking with. */
  otherName: string;
  otherNameUr: string | null;
  trade: PublicCandidate["trade"];
  pricePkr: number;
  startAt: string;
  durationMin: number;
  areaName: string;
  requestId: string;
  conversationId: string;
};

type ApiOk = { ok: true; data: { job: { id: string; pricePkr: number; startAt: string } } };
type ApiFail = {
  ok: false;
  error: { code: string; details?: { reason?: string; alternatives?: PublicCandidate[] } };
};

type View =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; jobId: string; pricePkr: number; startAt: string }
  | { kind: "conflict"; alternatives: PublicCandidate[] }
  | { kind: "unavailable"; reason: string }
  | { kind: "error" };

const newKey = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const KNOWN_REASONS = new Set([
  "offer_withdrawn",
  "offer_declined",
  "offer_countered",
  "offer_expired",
  "offer_accepted",
  "offer_time_passed",
  "request_booked",
  "request_expired",
  "request_cancelled",
  "conversation_declined",
  "conversation_closed",
  "worker_outside_hours",
  "worker_toggle_off",
  "own_offer",
]);

export const reasonKey = (reason: string | undefined): MessageKey =>
  (KNOWN_REASONS.has(reason ?? "")
    ? `booking.reason.${reason}`
    : "booking.reason.generic") as MessageKey;

/**
 * The accept screen (Figma 11) and its two failure screens (Figma 13). Success is shown only
 * from the server's response, never optimistically. The Idempotency-Key is created once per
 * visit and reused on every retry, so a retry after a dropped connection cannot book twice.
 */
export function AcceptPanel({
  summary,
  role,
  canAccept,
  blockedReason,
}: {
  summary: AcceptSummary;
  role: "customer" | "worker";
  canAccept: boolean;
  blockedReason?: string;
}) {
  const { t, lang } = useI18n();
  const online = useOnline();
  const key = useRef<string>(null);
  const [view, setView] = useState<View>({ kind: "idle" });

  const start = new Date(summary.startAt);
  const when = `${formatKarachiDate(start, lang)}, ${formatKarachiTime(start, lang)}`;
  const name = lang === "ur" && summary.otherNameUr ? summary.otherNameUr : summary.otherName;
  const amount = formatPkr(summary.pricePkr);
  const base = role === "customer" ? "/c" : "/w";

  const spoken = [
    t(role === "customer" ? "booking.accept.intro" : "booking.accept.introWorker", { name }),
    `${t("booking.accept.price")}: ${amount}.`,
    `${t("booking.accept.when")}: ${when}.`,
    t("booking.accept.noPayment"),
  ].join(" ");

  const confirm = async () => {
    key.current ??= newKey();
    setView({ kind: "pending" });
    try {
      const res = await fetch(`/api/offers/${summary.offerId}/accept`, {
        method: "POST",
        headers: { "idempotency-key": key.current },
      });
      const json = (await res.json()) as ApiOk | ApiFail;
      if (json.ok) {
        // Server data only: the price and time shown now are what was stored.
        setView({
          kind: "success",
          jobId: json.data.job.id,
          pricePkr: json.data.job.pricePkr,
          startAt: json.data.job.startAt,
        });
        return;
      }
      if (json.error.code === "CONFLICT_BOOKED") {
        setView({ kind: "conflict", alternatives: json.error.details?.alternatives ?? [] });
      } else if (json.error.code === "CONFLICT_STATE" || json.error.code === "FORBIDDEN") {
        setView({ kind: "unavailable", reason: json.error.details?.reason ?? "generic" });
      } else {
        setView({ kind: "error" });
      }
    } catch {
      // Network failure: the outcome is unknown, so the same key is kept for the retry.
      setView({ kind: "error" });
    }
  };

  if (view.kind === "success") {
    const s = new Date(view.startAt);
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 text-center" data-testid="accept-success">
          <CircleCheck aria-hidden className="size-16 text-primary" />
          <h1 className="text-2xl font-bold">{t("booking.accept.successTitle")}</h1>
          <p className="text-lg">
            {t("booking.accept.successBody", {
              name,
              when: `${formatKarachiDate(s, lang)}, ${formatKarachiTime(s, lang)}`,
            })}
          </p>
          <p className="num text-xl font-bold">{formatPkr(view.pricePkr)}</p>
          <p className="text-text-muted">{t("booking.accept.successNote")}</p>
          <Button asChild size="lg" fullWidth label={t("booking.accept.viewJob")}>
            <Link href={`${base}/job/${view.jobId}`}>{t("booking.accept.viewJob")}</Link>
          </Button>
        </div>
      </Panel>
    );
  }

  if (view.kind === "conflict") {
    return (
      <Panel wide>
        <div className="flex flex-col gap-4" data-testid="accept-conflict">
          <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-4" role="alert">
            <TriangleAlert aria-hidden className="mt-1 size-6 shrink-0" />
            <div>
              <h1 className="text-xl font-bold">{t("booking.conflict.title")}</h1>
              <p>{t("booking.conflict.body")}</p>
            </div>
          </div>
          {role === "customer" ? (
            <section aria-labelledby="alts" className="flex flex-col gap-3">
              <h2 id="alts" className="text-lg font-semibold">
                {t("booking.conflict.alternatives")}
              </h2>
              {view.alternatives.length === 0 ? (
                <p
                  className="rounded-lg bg-canvas p-4 text-text-muted"
                  data-testid="no-alternatives"
                >
                  {t("booking.conflict.none")}
                </p>
              ) : (
                <ul className="flex flex-col gap-3" data-testid="alternatives">
                  {view.alternatives.map((c) => (
                    <li key={c.workerId}>
                      <Link
                        href={`/c/workers/${c.workerId}`}
                        className="block rounded-lg focus-visible:outline-2"
                      >
                        <WorkerCard
                          name={c.name}
                          trade={c.trade}
                          indicativeRatePkr={c.indicativeRatePkr}
                          rating={
                            c.reviewCount && c.avgStars !== null
                              ? { avg: c.avgStars, count: c.reviewCount }
                              : null
                          }
                          distanceKm={c.distanceKm}
                          freeAt={start}
                          isSeeded={c.isDemo}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="outline" fullWidth label={t("booking.conflict.seeAll")}>
                <Link href={`/c/request/${summary.requestId}`}>{t("booking.conflict.seeAll")}</Link>
              </Button>
            </section>
          ) : (
            <Button asChild variant="outline" fullWidth label={t("booking.accept.backToChat")}>
              <Link href={`${base}/chat/${summary.conversationId}`}>
                {t("booking.accept.backToChat")}
              </Link>
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  if (view.kind === "unavailable" || !canAccept) {
    const reason = view.kind === "unavailable" ? view.reason : blockedReason;
    return (
      <Panel>
        <div className="flex flex-col gap-4 text-center" data-testid="accept-unavailable">
          <TriangleAlert aria-hidden className="mx-auto size-12 text-text-muted" />
          <h1 className="text-xl font-bold">{t("booking.accept.unavailableTitle")}</h1>
          <p className="text-lg" role="alert">
            {t(reasonKey(reason))}
          </p>
          <Button asChild fullWidth label={t("booking.accept.backToChat")}>
            <Link href={`${base}/chat/${summary.conversationId}`}>
              {t("booking.accept.backToChat")}
            </Link>
          </Button>
        </div>
      </Panel>
    );
  }

  const pending = view.kind === "pending";
  return (
    <Panel>
      <div className="flex flex-col gap-5" data-testid="accept-panel">
        <h1 className="text-2xl font-bold">{t("booking.accept.title")}</h1>
        <p className="text-lg">
          {t(role === "customer" ? "booking.accept.intro" : "booking.accept.introWorker", { name })}
        </p>
        <SpeakButton text={spoken} className="self-start" />

        <dl className="flex flex-col gap-3 rounded-lg bg-canvas p-4">
          <Row
            icon={<ShieldCheck />}
            label={t(role === "customer" ? "booking.accept.worker" : "booking.accept.customer")}
          >
            <span className="font-semibold">{name}</span> · {t(`trades.${summary.trade}`)}
          </Row>
          <Row icon={<Wallet />} label={t("booking.accept.price")}>
            <span className="num text-2xl font-bold" data-testid="accept-price">
              {amount}
            </span>
            <span className="block text-sm text-text-muted">{t("booking.accept.priceNote")}</span>
          </Row>
          <Row icon={<CalendarClock />} label={t("booking.accept.when")}>
            <span className="num font-semibold">{when}</span>
            <span className="block text-sm text-text-muted">
              {t("booking.accept.duration", { minutes: summary.durationMin })}
            </span>
          </Row>
          <Row icon={<MapPin />} label={t("booking.accept.area")}>
            <span>{summary.areaName}</span>
            <span className="block text-sm text-text-muted">
              {t(
                role === "customer"
                  ? "booking.accept.addressCustomer"
                  : "booking.accept.addressWorker",
              )}
            </span>
          </Row>
        </dl>

        <p className="rounded-lg bg-primary-soft p-3 font-medium text-primary-strong">
          {t("booking.accept.noPayment")}
        </p>

        {view.kind === "error" ? (
          <p role="alert" className="text-danger" data-testid="accept-error">
            {t("booking.job.actionFailed")}
          </p>
        ) : null}
        {!online ? (
          <p role="status" className="text-danger" data-testid="accept-offline">
            {t("booking.accept.offline")}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            fullWidth
            loading={pending}
            disabled={!online}
            onClick={() => void confirm()}
            label={
              pending
                ? t("booking.accept.pending")
                : view.kind === "error"
                  ? t("booking.accept.retry")
                  : t("booking.accept.button", { amount })
            }
            data-testid="accept-button"
          />
          <Button asChild variant="outline" fullWidth label={t("booking.accept.notNow")}>
            <Link href={`${base}/chat/${summary.conversationId}`}>
              {t("booking.accept.notNow")}
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Desktop: a centred card. Phone: the whole screen (Figma 11). */
function Panel({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-start justify-center md:items-center">
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-none border-0 bg-surface p-0 md:rounded-xl md:border md:border-border md:p-8`}
      >
        {children}
      </div>
    </div>
  );
}

function Row({
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
