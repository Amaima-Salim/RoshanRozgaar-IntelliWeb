"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { OfferView } from "@/lib/chat/offers";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { useOnline } from "@/lib/hooks/use-online";

/**
 * The offer card (Figma 10): price large, "fixed price", time and duration. The proposer can
 * withdraw while it is pending; the other person can Accept (the booking screen), Counter or
 * Decline. Accept never books from here: it opens the confirm screen that states the terms.
 */
export function OfferCard({
  offer,
  mine,
  otherName,
  role,
  aiDrafted,
  onCounter,
  onChanged,
}: {
  offer: OfferView;
  mine: boolean;
  otherName: string;
  role: "customer" | "worker";
  aiDrafted: boolean;
  onCounter: (offer: OfferView) => void;
  onChanged: (offer: OfferView) => void;
}) {
  const { t, lang } = useI18n();
  const online = useOnline();
  const [busy, setBusy] = useState<"decline" | "withdraw" | null>(null);
  const [failed, setFailed] = useState(false);
  const start = new Date(offer.startAt);
  const base = role === "customer" ? "/c" : "/w";
  const pending = offer.status === "pending";

  const respond = async (action: "decline" | "withdraw") => {
    setBusy(action);
    setFailed(false);
    try {
      const res = await fetch(`/api/offers/${offer.id}/${action}`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; data?: { offer: OfferView } };
      if (!json.ok || !json.data) throw new Error(action);
      onChanged(json.data.offer);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      className={cn(
        "flex w-full max-w-sm flex-col gap-3 rounded-xl border-2 bg-surface p-4 text-text",
        pending ? "border-primary" : "border-border opacity-90",
        mine ? "self-end" : "self-start",
      )}
      data-testid="offer-card"
      data-status={offer.status}
      data-offer-id={offer.id}
    >
      <p className="text-sm text-text-muted">
        {mine ? t("offerCard.fromYou") : t("offerCard.fromThem", { name: otherName })}
      </p>
      <p>
        <span className="num text-3xl font-bold" data-testid="offer-card-price">
          {formatPkr(offer.pricePkr)}
        </span>{" "}
        <span className="text-sm text-text-muted">{t("offerCard.fixedPrice")}</span>
      </p>
      <p className="num text-sm">
        {formatKarachiDate(start, lang)}, {formatKarachiTime(start, lang)} ·{" "}
        {t("offerCard.duration", { minutes: offer.durationMin })}
      </p>
      {aiDrafted ? (
        <p className="inline-flex items-center gap-1 self-start rounded-pill bg-info-soft px-2.5 py-0.5 text-xs text-info">
          <Sparkles aria-hidden className="size-3.5" />
          {t("offerCard.aiDraft")}
        </p>
      ) : null}
      <p
        className={cn(
          "self-start rounded-pill px-3 py-1 text-sm font-medium",
          offer.status === "accepted" ? "bg-primary-soft text-primary-strong" : "bg-canvas",
        )}
        data-testid="offer-status"
      >
        {t(`offerCard.status.${offer.status}`)}
      </p>

      {pending && !mine ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild label={t("offerCard.accept")}>
            <Link href={`${base}/offer/${offer.id}`} data-testid="offer-accept">
              {t("offerCard.accept")}
            </Link>
          </Button>
          <Button
            variant="outline"
            label={t("offerCard.counter")}
            disabled={!online || busy !== null}
            onClick={() => onCounter(offer)}
            data-testid="offer-counter"
          />
          <Button
            variant="outline"
            label={t("offerCard.decline")}
            loading={busy === "decline"}
            disabled={!online || busy !== null}
            onClick={() => void respond("decline")}
            data-testid="offer-decline"
          />
        </div>
      ) : null}
      {pending && mine ? (
        <Button
          variant="outline"
          label={t("offerCard.withdraw")}
          loading={busy === "withdraw"}
          disabled={!online || busy !== null}
          onClick={() => void respond("withdraw")}
          data-testid="offer-withdraw"
        />
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t("offerCard.failed")}
        </p>
      ) : null}
    </article>
  );
}
