"use client";

import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { GuideButtons } from "@/components/guide/GuideButtons";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Tile";
import { nearestArea } from "@/lib/domain/geo";
import { useI18n } from "@/lib/i18n/client";

type Area = { slug: string; nameEn: string; nameUr: string; lat: number; lng: number };
type Lang = "ur" | "en";

/** Three quick answers (docs/01 §3): name, area (location or tiles), language. */
export function CustomerOnboardingForm({
  areas,
  initialName,
  initialLang,
}: {
  areas: Area[];
  initialName: string;
  initialLang: Lang;
}) {
  const { t, bi, lang } = useI18n();
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState(initialName);
  const [areaSlug, setAreaSlug] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>(initialLang);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useLocation = () => {
    setNote(null);
    if (!navigator.geolocation) return setNote(t("customerOnboarding.locationDenied"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const hit = nearestArea({ lat: pos.coords.latitude, lng: pos.coords.longitude }, areas);
        if (hit) setAreaSlug(hit.area.slug);
        else setNote(t("customerOnboarding.locationFar"));
      },
      () => {
        setLocating(false);
        setNote(t("customerOnboarding.locationDenied"));
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  const chooseLanguage = async (next: Lang) => {
    setLanguage(next);
    await fetch("/api/me/language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => null);
    router.refresh();
  };

  const submit = async () => {
    if (!name.trim()) return setError(t("customerOnboarding.nameRequired"));
    if (!areaSlug) return setError(t("customerOnboarding.areaRequired"));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), areaSlug, language }),
      });
      if (!res.ok) throw new Error("save");
      router.replace("/c/request/new");
      router.refresh();
    } catch {
      setBusy(false);
      setError(t("customerOnboarding.error"));
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-xl border border-border bg-surface p-5 md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">{t("customerOnboarding.title")}</h1>
        <p className="text-text-muted">{t("customerOnboarding.subtitle")}</p>
        <GuideButtons id="customerOnboarding" />
      </div>

      <label htmlFor={nameId} className="flex flex-col gap-2">
        <span className="text-lg font-semibold">{t("customerOnboarding.nameLabel")}</span>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={80}
          placeholder={t("customerOnboarding.namePlaceholder")}
          className="h-14 rounded-lg border-2 border-border bg-surface px-4 text-lg focus:border-primary"
          data-testid="customer-name"
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">
          {t("customerOnboarding.areaQuestion")}
        </legend>
        <Button
          variant="outline"
          loading={locating}
          icon={<LocateFixed aria-hidden />}
          onClick={useLocation}
          data-testid="use-location"
          {...bi("customerOnboarding.useLocation")}
        />
        {note ? (
          <p role="status" className="text-text-muted" data-testid="location-note">
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
                onClick={() => setAreaSlug(a.slug)}
                data-testid={`c-area-${a.slug}`}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">
          {t("customerOnboarding.languageQuestion")}
        </legend>
        <ul className="grid grid-cols-2 gap-3">
          {(["ur", "en"] as const).map((l) => (
            <li key={l}>
              <Tile
                className="w-full"
                icon={<span className="text-2xl font-bold">{l === "ur" ? "اردو" : "EN"}</span>}
                label={l === "ur" ? "اردو" : "English"}
                selected={language === l}
                onClick={() => void chooseLanguage(l)}
                data-testid={`c-lang-${l}`}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      {error ? (
        <p role="alert" className="font-semibold text-danger" data-testid="customer-error">
          {error}
        </p>
      ) : null}
      <Button
        size="lg"
        fullWidth
        loading={busy}
        onClick={submit}
        data-testid="customer-continue"
        {...bi("customerOnboarding.continue")}
      />
    </section>
  );
}
