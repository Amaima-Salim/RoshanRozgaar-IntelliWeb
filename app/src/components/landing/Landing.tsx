import {
  CalendarCheck,
  Hammer,
  HandCoins,
  MapPinned,
  MessageCircle,
  Mic,
  Snowflake,
  Smartphone,
  Star,
  UserCheck,
  Users,
  Volume2,
  Wrench,
  Zap,
  Droplets,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { LanguageToggle } from "@/components/shell/LanguageToggle";
import { Logo } from "@/components/shell/Logo";
import type { TFn } from "@/lib/i18n";
import { InstallButton } from "./InstallButton";

const WORKER = "/login?role=worker";
const CUSTOMER = "/login?role=customer";

const TRADES: { Icon: LucideIcon; key: Parameters<TFn>[0] }[] = [
  { Icon: Zap, key: "home.tradeElectrician" },
  { Icon: Droplets, key: "home.tradePlumber" },
  { Icon: Snowflake, key: "home.tradeAc" },
  { Icon: Hammer, key: "home.tradeCarpenter" },
  { Icon: Wrench, key: "home.tradeMechanic" },
];

const btn =
  "inline-flex min-h-touch items-center justify-center rounded-md px-6 font-bold transition-colors";
const btnPrimary = cn(btn, "bg-primary text-on-primary hover:bg-primary-strong");
const btnAccent = cn(btn, "bg-accent text-text hover:brightness-95");
const btnLight = cn(btn, "bg-white text-primary-strong hover:bg-primary-soft");

function IconBubble({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-primary",
        className,
      )}
    >
      <Icon aria-hidden className="size-6" />
    </span>
  );
}

function Feature({
  Icon,
  title,
  body,
  dark,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  dark?: boolean;
}) {
  return (
    <li className="flex items-start gap-4">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          dark ? "bg-white/15 text-accent" : "bg-primary-soft text-primary",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{title}</span>
        <span className={dark ? "text-white/80" : "text-text-muted"}>{body}</span>
      </span>
    </li>
  );
}

/** Public landing page for signed-out visitors (UX Pilot export, Nov 2026). */
export function Landing({ t }: { t: TFn }) {
  const ctas = (light?: boolean) => (
    <div className="flex flex-wrap gap-3">
      <Link href={CUSTOMER} className={light ? btnLight : btnPrimary} data-testid="role-customer">
        {t("home.needWorker")}
      </Link>
      <Link href={WORKER} className={btnAccent} data-testid="role-worker">
        {t("home.iAmWorker")}
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        {t("app.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-content items-center gap-4 px-4 md:px-6">
          <Logo />
          <nav className="hidden flex-1 items-center justify-center gap-8 text-sm font-medium text-text-muted md:flex">
            <a href="#how" className="hover:text-primary">
              {t("home.navHow")}
            </a>
            <a href="#workers" className="hover:text-primary">
              {t("home.navWorkers")}
            </a>
            <a href="#households" className="hover:text-primary">
              {t("home.navHouseholds")}
            </a>
          </nav>
          <div className="ms-auto flex items-center gap-2 md:ms-0">
            <LanguageToggle className="px-3" />
            <Link href="/login" className={cn(btnPrimary, "hidden rounded-pill md:inline-flex")}>
              {t("home.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-content items-center gap-8 px-4 py-10 md:grid-cols-2 md:gap-12 md:px-6 md:py-16">
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <h1 className="text-4xl font-bold leading-tight text-text md:text-6xl md:leading-tight">
                {t("home.heroLine1")} <span className="text-primary">{t("home.heroLine2")}</span>
              </h1>
              <SpeakButton
                text={`${t("home.heroLine1")} ${t("home.heroLine2")}`}
                className="mt-2 shrink-0"
              />
            </div>
            <p className="max-w-xl text-lg text-text-muted">{t("home.heroSub")}</p>
            {ctas()}
          </div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl shadow-xl md:aspect-[4/3]">
            <Image
              src="/landing/hero.jpg"
              alt={t("home.heroImageAlt")}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover object-[30%_center]"
            />
          </div>
        </section>

        {/* Trades */}
        <section aria-label={t("home.tradesLabel")} className="bg-surface">
          <ul className="mx-auto grid max-w-content grid-cols-2 gap-3 px-4 py-8 md:grid-cols-5 md:gap-4 md:px-6 md:py-10">
            {TRADES.map(({ Icon, key }) => (
              <li
                key={key}
                className="flex flex-col items-center gap-3 rounded-lg bg-canvas px-4 py-5 text-center font-semibold"
              >
                <span className="flex size-12 items-center justify-center rounded-pill border-2 border-primary text-primary">
                  <Icon aria-hidden className="size-6" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="mx-auto max-w-content scroll-mt-20 px-4 py-14 md:px-6 md:py-20"
        >
          <h2 className="mb-10 text-center text-3xl font-bold">
            <span className="border-b-4 border-accent pb-1">{t("home.howTitle")}</span>
          </h2>
          <ol className="grid gap-8 md:grid-cols-3">
            {(
              [
                [Mic, "home.step1Title", "home.step1Body"],
                [Users, "home.step2Title", "home.step2Body"],
                [CalendarCheck, "home.step3Title", "home.step3Body"],
              ] as const
            ).map(([Icon, title, body]) => (
              <li key={title} className="flex flex-col items-center gap-3 text-center">
                <IconBubble Icon={Icon} className="size-16 [&>svg]:size-7" />
                <h3 className="text-xl font-bold">{t(title)}</h3>
                <p className="max-w-xs text-text-muted">{t(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* For workers */}
        <section id="workers" className="scroll-mt-16 bg-primary text-on-primary">
          <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-14 md:grid-cols-2 md:gap-16 md:px-6 md:py-20">
            <div
              aria-hidden
              className="mx-auto w-64 rounded-[2.5rem] border-8 border-text bg-surface p-5 text-text shadow-xl"
            >
              <div className="flex flex-col items-center gap-5 py-4 text-center">
                <p className="text-sm font-bold text-primary">{t("home.phoneTitle")}</p>
                <p className="text-xs text-text-muted">{t("home.phoneHint")}</p>
                <span className="flex size-24 items-center justify-center rounded-pill border-4 border-primary bg-primary-soft text-primary">
                  <Mic className="size-10" />
                </span>
                <span className="h-2 w-full rounded-pill bg-canvas" />
                <span className="w-full rounded-md bg-primary py-3 text-sm font-bold text-on-primary">
                  {t("home.phoneButton")}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <h2 className="text-3xl font-bold md:text-4xl">{t("home.workersTitle")}</h2>
              <ul className="flex flex-col gap-6">
                <Feature
                  dark
                  Icon={MessageCircle}
                  title={t("home.w1Title")}
                  body={t("home.w1Body")}
                />
                <Feature dark Icon={Volume2} title={t("home.w2Title")} body={t("home.w2Body")} />
                <Feature dark Icon={Zap} title={t("home.w3Title")} body={t("home.w3Body")} />
              </ul>
            </div>
          </div>
        </section>

        {/* For households */}
        <section id="households" className="scroll-mt-16 bg-surface">
          <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-14 md:grid-cols-2 md:gap-16 md:px-6 md:py-20">
            <div className="flex flex-col gap-6">
              <h2 className="text-3xl font-bold md:text-4xl">{t("home.householdsTitle")}</h2>
              <ul className="flex flex-col gap-6">
                <Feature Icon={MapPinned} title={t("home.h1Title")} body={t("home.h1Body")} />
                <Feature Icon={Mic} title={t("home.h2Title")} body={t("home.h2Body")} />
                <Feature Icon={HandCoins} title={t("home.h3Title")} body={t("home.h3Body")} />
              </ul>
            </div>
            <div className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-lg">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-xl font-bold text-primary"
                >
                  {t("home.sampleName").charAt(0)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{t("home.sampleName")}</span>
                  <span className="text-sm text-text-muted">{t("home.sampleMeta")}</span>
                </div>
                <span className="rounded-pill bg-primary-soft px-2 py-1 text-xs font-bold text-primary-strong">
                  {t("home.sampleBadge")}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-canvas px-4 py-3 text-sm">
                <span className="flex items-center gap-1">
                  <Star aria-hidden className="size-4 fill-accent text-accent" />
                  <b>4.8</b>
                  <span className="text-text-muted">{t("home.sampleReviews")}</span>
                </span>
                <b className="text-primary">{t("home.samplePrice")}</b>
              </div>
              <p className="text-sm italic text-text-muted">{t("home.sampleQuote")}</p>
              <Link href={CUSTOMER} className={btnPrimary}>
                {t("home.sampleContact")}
              </Link>
              <p className="text-center text-xs text-text-muted">{t("home.sampleNote")}</p>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-content px-4 py-14 md:px-6 md:py-20">
          <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl">
            {t("home.trustTitle")}
          </h2>
          <ul className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
            {(
              [
                [Star, "home.trust1Title", "home.trust1Body"],
                [UserCheck, "home.trust2Title", "home.trust2Body"],
              ] as const
            ).map(([Icon, title, body]) => (
              <li
                key={title}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6"
              >
                <Icon aria-hidden className="size-7 text-primary" />
                <h3 className="text-lg font-bold">{t(title)}</h3>
                <p className="text-text-muted">{t(body)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Install */}
        <section className="mx-auto max-w-content px-4 pb-14 md:px-6">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4 md:px-6">
            <IconBubble Icon={Smartphone} className="size-10 rounded-md [&>svg]:size-5" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-bold">{t("home.installTitle")}</span>
              <span className="text-sm text-text-muted">{t("home.installBody")}</span>
            </div>
            <InstallButton />
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-primary px-4 py-14 text-center text-on-primary md:py-20">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">{t("home.ctaTitle")}</h2>
          <div className="flex justify-center">
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={WORKER} className={btnAccent}>
                {t("home.iAmWorker")}
              </Link>
              <Link href={CUSTOMER} className={btnLight}>
                {t("home.needWorker")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-content gap-8 px-4 py-10 md:grid-cols-3 md:px-6">
          <div className="flex flex-col gap-3">
            <Logo />
            <p className="text-sm text-text-muted">{t("home.footerAbout")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-bold">{t("home.footerDemoTitle")}</span>
            <p className="text-sm text-text-muted">
              <span className="me-2 rounded-sm bg-accent-soft px-2 py-0.5 text-xs font-bold">
                {t("home.footerDemoBadge")}
              </span>
              {t("home.footerDemoBody")}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="font-bold">{t("home.footerLang")}</span>
            <LanguageToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}
