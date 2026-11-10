"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { OfferView } from "@/lib/chat/offers";
import { karachiDayBounds } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { useOnline } from "@/lib/hooks/use-online";

export type OfferDraft = { pricePkr: number | null; aiDrafted: boolean };

const newId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const round50 = (n: number) => Math.max(100, Math.round(n / 50) * 50);

/**
 * Compose an offer or a counter-offer with taps: price chips, start-time tiles, duration chips
 * (docs/03 §4). An AI draft only pre-selects the price and is labelled; nothing is sent until
 * the person presses Send. The client message id is fixed per open composer, so a retry after a
 * dropped connection cannot create a second offer.
 */
export function OfferComposer({
  conversationId,
  requestStartAt,
  requestDurationMin,
  ratePkr,
  counterOf,
  draft,
  onClose,
  onSent,
}: {
  conversationId: string;
  requestStartAt: string;
  requestDurationMin: number;
  ratePkr: number | null;
  counterOf?: OfferView;
  draft?: OfferDraft;
  onClose: () => void;
  onSent: (offer: OfferView) => void;
}) {
  const { t } = useI18n();
  const online = useOnline();
  const [clientMsgId] = useState(newId);
  const [nowMs] = useState(() => Date.now());

  const prices = (() => {
    const base = counterOf?.pricePkr ?? ratePkr ?? 1500;
    const set = new Set([
      round50(base * 0.8),
      round50(base),
      round50(base * 1.2),
      round50(base * 1.5),
    ]);
    if (counterOf) set.add(counterOf.pricePkr);
    if (draft?.pricePkr) set.add(draft.pricePkr);
    return [...set].sort((a, b) => a - b);
  })();

  const [price, setPrice] = useState<number | null>(draft?.pricePkr ?? null);
  const [custom, setCustom] = useState("");
  const [aiDrafted, setAiDrafted] = useState(!!draft?.aiDrafted && !!draft.pricePkr);
  const requested = new Date(counterOf?.startAt ?? requestStartAt);
  const tiles = (() => {
    const now = new Date(nowMs);
    const tomorrow10 = new Date(karachiDayBounds(now).start.getTime() + (24 + 10) * 3_600_000);
    const list: { id: string; label: string; at: Date }[] = [];
    if (requested.getTime() > now.getTime() - 5 * 60_000)
      list.push({ id: "request", label: t("offerCard.startRequest"), at: requested });
    list.push({
      id: "hour",
      label: t("offerCard.startHour"),
      at: new Date(now.getTime() + 3_600_000),
    });
    list.push({ id: "tomorrow", label: t("offerCard.startTomorrow"), at: tomorrow10 });
    return list;
  })();
  const [startId, setStartId] = useState<string | null>(tiles[0]?.id ?? null);
  const [picked, setPicked] = useState("");
  const [durationMin, setDurationMin] = useState(
    counterOf?.durationMin ?? Math.min(240, Math.max(60, Math.round(requestDurationMin / 60) * 60)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAt =
    startId === "pick"
      ? picked
        ? new Date(`${picked}:00+05:00`) // the picker is Asia/Karachi (fixed UTC+5, docs/03 §3)
        : null
      : (tiles.find((x) => x.id === startId)?.at ?? null);

  const send = async () => {
    if (!price) return setError(t("offerCard.needPrice"));
    if (!startAt || Number.isNaN(startAt.getTime())) return setError(t("offerCard.needTime"));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientMsgId,
          pricePkr: price,
          startAt: startAt.toISOString(),
          durationMin,
          ...(counterOf ? { counterOfOfferId: counterOf.id } : {}),
          ...(aiDrafted ? { aiDrafted: true } : {}),
        }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { offer: OfferView } };
      if (!res.ok || !json.ok || !json.data) throw new Error("offer");
      onSent(json.data.offer);
    } catch {
      setError(t("offerCard.failed"));
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      "min-h-touch rounded-pill border-2 px-4 font-medium",
      active
        ? "border-primary bg-primary-soft text-primary-strong"
        : "border-border hover:bg-canvas",
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={counterOf ? t("offerCard.counterTitle") : t("offerCard.newOffer")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
      data-testid="offer-composer"
    >
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl bg-surface p-5 md:max-w-lg md:rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            {counterOf ? t("offerCard.counterTitle") : t("offerCard.newOffer")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("offerCard.close")}
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-lg hover:bg-canvas"
          >
            <X aria-hidden />
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">{t("offerCard.priceTitle")}</legend>
          {aiDrafted ? (
            <p
              className="inline-flex items-center gap-1 self-start rounded-pill bg-info-soft px-3 py-1 text-sm text-info"
              data-testid="offer-ai-draft"
            >
              <Sparkles aria-hidden className="size-4" />
              {t("offerCard.aiDraft")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {prices.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={price === p && !custom}
                className={chip(price === p && !custom)}
                onClick={() => {
                  setPrice(p);
                  setCustom("");
                  if (p !== draft?.pricePkr) setAiDrafted(false);
                }}
                data-testid={`offer-price-${p}`}
              >
                <span className="num">{formatPkr(p)}</span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            {t("offerCard.priceOther")}
            <input
              inputMode="numeric"
              dir="ltr"
              value={custom}
              placeholder={t("offerCard.priceInput")}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                setCustom(digits);
                setPrice(digits ? Number(digits) : null);
                setAiDrafted(false);
              }}
              className="num h-14 rounded-lg border-2 border-border bg-surface px-4 text-lg text-text focus:border-primary"
              data-testid="offer-price-custom"
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">{t("offerCard.startTitle")}</legend>
          <div className="flex flex-wrap gap-2">
            {tiles.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={startId === x.id}
                className={chip(startId === x.id)}
                onClick={() => setStartId(x.id)}
                data-testid={`offer-start-${x.id}`}
              >
                {x.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={startId === "pick"}
              className={chip(startId === "pick")}
              onClick={() => setStartId("pick")}
              data-testid="offer-start-pick"
            >
              {t("offerCard.startPick")}
            </button>
          </div>
          {startId === "pick" ? (
            <input
              type="datetime-local"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              aria-label={t("offerCard.startPick")}
              className="h-14 rounded-lg border-2 border-border bg-surface px-4"
              data-testid="offer-start-input"
            />
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">{t("offerCard.durationTitle")}</legend>
          <div className="flex flex-wrap gap-2">
            {[60, 120, 180, 240].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={durationMin === m}
                className={chip(durationMin === m)}
                onClick={() => setDurationMin(m)}
                data-testid={`offer-duration-${m}`}
              >
                {t("offerCard.hours", { count: m / 60 })}
              </button>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-danger" data-testid="offer-error">
            {error}
          </p>
        ) : null}
        <Button
          size="lg"
          fullWidth
          loading={busy}
          disabled={!online || !price || !startAt}
          onClick={() => void send()}
          label={
            price
              ? t("offerCard.send", { amount: formatPkr(price) })
              : t("offerCard.send", { amount: "—" })
          }
          data-testid="offer-send"
        />
      </div>
    </div>
  );
}
