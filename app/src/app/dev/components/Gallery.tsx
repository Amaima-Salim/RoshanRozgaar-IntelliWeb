"use client";

import { Hammer, Plug, Wrench } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { MicButton, type MicState } from "@/components/ui/MicButton";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tile } from "@/components/ui/Tile";
import { useToast } from "@/components/ui/Toast";
import { WorkerCard } from "@/components/ui/WorkerCard";
import { useI18n } from "@/lib/i18n/client";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-en text-sm font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/** Dev-only gallery. Sample data below is static and fictional. */
export function Gallery() {
  const { bi, t } = useI18n();
  const toast = useToast();
  const [selected, setSelected] = useState("plumber");
  const [mic, setMic] = useState<MicState>("idle");
  const freeAt = new Date("2026-11-10T10:00:00Z");

  return (
    <div className="flex flex-col gap-10">
      <Section title="Button">
        {(["primary", "secondary", "outline", "accent", "danger"] as const).map((v) => (
          <Button key={v} variant={v} {...bi("landing.continueAs")} />
        ))}
        <Button size="lg" loading {...bi("login.sendCode")} />
        <Button
          id="disabled-demo"
          disabled
          disabledReason={t("banner.offline")}
          {...bi("login.verify")}
        />
      </Section>

      <Section title="Tile / Tile selected">
        <div className="grid w-full grid-cols-3 gap-3 md:max-w-xl">
          {[
            { id: "electrician", Icon: Plug },
            { id: "plumber", Icon: Wrench },
            { id: "carpenter", Icon: Hammer },
          ].map(({ id, Icon }) => (
            <Tile
              key={id}
              icon={<Icon />}
              selected={selected === id}
              onClick={() => setSelected(id)}
              {...bi(`trades.${id as "plumber"}`)}
            />
          ))}
        </div>
      </Section>

      <Section title="Pills / Badges">
        {(["free", "engaged", "ai", "demo", "testMode"] as const).map((k) => (
          <Badge key={k} kind={k} />
        ))}
        <StatusPill status="pending" />
        <StatusPill status="success" />
        <StatusPill status="failed" />
      </Section>

      <Section title="Banners">
        <div className="flex w-full flex-col gap-3">
          <Banner kind="demoLogin" />
          <Banner kind="testMode" />
          <Banner kind="offline" />
        </div>
      </Section>

      <Section title="MicButton (states stubbed) · SpeakButton (hidden without audio)">
        {(["idle", "listening", "processing", "error"] as const).map((s) => (
          <MicButton key={s} state={s} />
        ))}
        <MicButton state={mic} onPress={() => setMic(mic === "idle" ? "listening" : "idle")} />
        <SpeakButton src={null} />
      </Section>

      <Section title="WorkerCard (static props)">
        <div className="grid w-full gap-3 xl:grid-cols-2">
          <WorkerCard
            name="Zahid Hussain"
            nameUr="زاہد حسین"
            trade="plumber"
            indicativeRatePkr={1000}
            rating={{ avg: 4.6, count: 18 }}
            distanceKm={2.1}
            freeAt={freeAt}
            isSeeded
          />
          <WorkerCard
            name="Usman Tariq"
            nameUr="عثمان طارق"
            trade="electrician"
            indicativeRatePkr={800}
            rating={null}
            distanceKm={4.9}
            freeAt={freeAt}
            isSeeded
          />
        </div>
      </Section>

      <Section title="Toast · Skeleton · Empty · Error">
        <Button
          variant="outline"
          onClick={() => toast("success", t("login.signedIn"))}
          {...bi("status.success")}
        />
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="grid w-full gap-3 xl:grid-cols-2">
          <EmptyState />
          <ErrorState onRetry={() => toast("info", t("state.retry"))} />
        </div>
      </Section>
    </div>
  );
}
