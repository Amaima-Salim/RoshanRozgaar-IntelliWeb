"use client";

import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { GuideButtons } from "@/components/guide/GuideButtons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Tile";
import { TRADE_ICONS } from "@/components/worker/trade-icons";
import { nearestArea } from "@/lib/domain/geo";
import { parseKarachiLocal, startForChip } from "@/lib/domain/time";
import { TRADES, type Trade } from "@/lib/domain/worker-profile";
import { useI18n } from "@/lib/i18n/client";

type Area = { slug: string; nameEn: string; nameUr: string; lat: number; lng: number };
type When = "now" | "evening" | "tomorrow" | "pick";
const WHEN_CHIPS: When[] = ["now", "evening", "tomorrow", "pick"];

/** Tap path of the request (docs/01 §3 O2): work, when, where. Every field is optional except these. */
export function RequestForm({
  areas,
  defaultAreaSlug,
  aiMode,
}: {
  areas: Area[];
  defaultAreaSlug: string | null;
  aiMode: "live" | "fixtures" | "off";
}) {
  const { t, tKey, bi, lang } = useI18n();
  const router = useRouter();
  const detailsId = useId();
  const pickId = useId();
  const budgetId = useId();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [details, setDetails] = useState("");
  const [when, setWhen] = useState<When>("now");
  const [pickValue, setPickValue] = useState("");
  const [areaSlug, setAreaSlug] = useState<string | null>(defaultAreaSlug);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useLocation = () => {
    setNote(null);
    if (!navigator.geolocation) return setNote(t("request.locationDenied"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const hit = nearestArea(here, areas);
        if (hit) {
          setAreaSlug(hit.area.slug);
          setPoint(here);
        } else setNote(t("request.locationFar"));
      },
      () => {
        setLocating(false);
        setNote(t("request.locationDenied"));
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  type Draft = {
    trade: Trade | null;
    when: "now" | "evening" | "tomorrow" | null;
    simulated: boolean;
  };
  const [draft, setDraft] = useState<Draft | "none" | "unavailable" | null>(null);
  const [drafting, setDrafting] = useState(false);

  const understand = async () => {
    setDrafting(true);
    setDraft(null);
    try {
      const res = await fetch("/api/ai/draft-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: details.trim() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { draft: Omit<Draft, "simulated">; simulated: boolean };
      };
      if (!json.ok || !json.data) setDraft("unavailable");
      else if (!json.data.draft.trade) setDraft("none");
      else setDraft({ ...json.data.draft, simulated: json.data.simulated });
    } catch {
      setDraft("unavailable");
    } finally {
      setDrafting(false);
    }
  };

  const applyDraft = (d: Draft) => {
    if (d.trade) setTrade(d.trade);
    if (d.when) setWhen(d.when);
    setDraft(null);
    setNote(t("request.draftApplied"));
  };

  const submit = async () => {
    setError(null);
    if (!trade) return setError(t("request.tradeRequired"));
    if (!areaSlug) return setError(t("request.areaRequired"));
    const now = new Date();
    let startAt: Date | null = null;
    if (when === "evening" || when === "tomorrow") startAt = startForChip(when, now);
    if (when === "pick") {
      startAt = parseKarachiLocal(pickValue);
      if (!startAt) return setError(t("request.whenRequired"));
      if (startAt.getTime() < now.getTime()) return setError(t("request.pastTime"));
    }
    const budgetPkr = Number(budget.replace(/[^\d]/g, ""));
    setBusy(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trade,
          source: "tap",
          summaryText: details.trim() || undefined,
          summaryLang: details.trim() ? lang : undefined,
          areaSlug,
          ...(point ?? {}),
          urgency: when === "now" ? "now" : when === "pick" ? "scheduled" : "today",
          ...(startAt && when !== "now" ? { startAt: startAt.toISOString() } : {}),
          ...(budgetPkr > 0 ? { budgetPkr } : {}),
        }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { id: string } };
      if (!json.ok || !json.data) throw new Error("create");
      router.push(`/c/request/${json.data.id}`);
    } catch {
      setBusy(false);
      setError(t("request.error"));
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-xl border border-border bg-surface p-5 md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">{t("request.title")}</h1>
        <p className="text-text-muted">{t("request.subtitle")}</p>
        <GuideButtons id="requestNew" />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("request.tradeQuestion")}</legend>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {TRADES.map((id) => {
            const Icon = TRADE_ICONS[id];
            return (
              <li key={id}>
                <Tile
                  className="w-full"
                  icon={<Icon />}
                  label={t(`trades.${id}`)}
                  selected={trade === id}
                  onClick={() => setTrade(id)}
                  data-testid={`trade-${id}`}
                />
              </li>
            );
          })}
        </ul>
        <label htmlFor={detailsId} className="mt-2 flex flex-col gap-2">
          <span className="font-semibold">{t("request.detailsLabel")}</span>
          <textarea
            id={detailsId}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t("request.detailsPlaceholder")}
            className="rounded-lg border-2 border-border bg-surface p-3 text-lg focus:border-primary"
            data-testid="request-details"
          />
        </label>
        {aiMode !== "off" && details.trim().length > 2 ? (
          <Button
            variant="outline"
            loading={drafting}
            onClick={understand}
            data-testid="request-understand"
            {...bi("request.understand")}
          />
        ) : null}
        {draft ? (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-lg border border-border bg-canvas p-4"
            data-testid="request-draft"
          >
            {draft === "none" || draft === "unavailable" ? (
              <p>{t(draft === "none" ? "request.draftNone" : "request.draftUnavailable")}</p>
            ) : (
              <>
                <p className="flex items-center gap-2 font-semibold">
                  {t("request.draftTitle")} <Badge kind="ai" />
                  {draft.simulated ? (
                    <span className="text-sm font-medium text-text-muted">
                      {t("onboarding.voice.simulated")}
                    </span>
                  ) : null}
                </p>
                <p>{t("request.draftTrade", { trade: t(`trades.${draft.trade!}`) })}</p>
                {draft.when ? (
                  <p>{t("request.draftWhen", { when: tKey(`request.${draft.when}`) })}</p>
                ) : null}
                <p className="text-sm text-text-muted">{t("request.draftNote")}</p>
                <Button
                  onClick={() => applyDraft(draft)}
                  data-testid="request-draft-use"
                  {...bi("request.draftUse")}
                />
              </>
            )}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("request.whenQuestion")}</legend>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {WHEN_CHIPS.map((w) => (
            <li key={w}>
              <Tile
                className="min-h-20 w-full"
                icon={<span className="text-xl font-bold">{tKey(`request.${w}`).slice(0, 1)}</span>}
                label={tKey(`request.${w}`)}
                selected={when === w}
                onClick={() => setWhen(w)}
                data-testid={`when-${w}`}
              />
            </li>
          ))}
        </ul>
        {when === "pick" ? (
          <label htmlFor={pickId} className="flex flex-col gap-2">
            <span className="font-semibold">{t("request.pickLabel")}</span>
            <input
              id={pickId}
              type="datetime-local"
              value={pickValue}
              onChange={(e) => setPickValue(e.target.value)}
              className="h-14 rounded-lg border-2 border-border bg-surface px-4 text-lg focus:border-primary"
              data-testid="when-pick-input"
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("request.whereQuestion")}</legend>
        <Button
          variant="outline"
          loading={locating}
          icon={<LocateFixed aria-hidden />}
          onClick={useLocation}
          data-testid="request-use-location"
          {...bi("request.useLocation")}
        />
        {note ? (
          <p role="status" className="text-text-muted" data-testid="request-location-note">
            {note}
          </p>
        ) : null}
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {areas.map((a) => (
            <li key={a.slug}>
              <Tile
                className="w-full"
                icon={<span className="num text-xl font-bold">{a.nameEn.slice(0, 4)}</span>}
                label={lang === "ur" ? a.nameUr : a.nameEn}
                caption={lang === "ur" ? a.nameEn : a.nameUr}
                selected={areaSlug === a.slug}
                onClick={() => {
                  setAreaSlug(a.slug);
                  setPoint(null);
                }}
                data-testid={`req-area-${a.slug}`}
              />
            </li>
          ))}
        </ul>
        <p className="text-sm text-text-muted">{t("request.whereNote")}</p>
      </fieldset>

      <label htmlFor={budgetId} className="flex flex-col gap-2">
        <span className="font-semibold">{t("request.budgetLabel")}</span>
        <input
          id={budgetId}
          value={budget}
          onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
          inputMode="numeric"
          className="num h-14 max-w-48 rounded-lg border-2 border-border bg-surface px-4 text-lg focus:border-primary"
          data-testid="request-budget"
        />
      </label>

      {error ? (
        <p role="alert" className="font-semibold text-danger" data-testid="request-error">
          {error}
        </p>
      ) : null}
      <Button
        size="lg"
        fullWidth
        loading={busy}
        onClick={submit}
        data-testid="request-submit"
        {...bi("request.submit")}
      />
    </section>
  );
}
