"use client";

import { CircleCheck, CircleDot, Database, FlaskConical, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

export type BadgeKind = "free" | "engaged" | "ai" | "demo" | "testMode";

const styles: Record<BadgeKind, { cls: string; Icon: typeof Sparkles }> = {
  free: { cls: "bg-primary-soft text-primary-strong", Icon: CircleCheck },
  engaged: { cls: "bg-accent-soft text-text", Icon: CircleDot },
  ai: { cls: "bg-info-soft text-info", Icon: Sparkles },
  demo: { cls: "bg-canvas text-text-muted border border-border", Icon: Database },
  testMode: { cls: "bg-accent-soft text-text border border-accent", Icon: FlaskConical },
};

/** Pills and badges. AI and demo badges are mandatory wherever that content appears (docs/03 §4). */
export function Badge({ kind, className }: { kind: BadgeKind; className?: string }) {
  const { t } = useI18n();
  const { cls, Icon } = styles[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-sm font-medium",
        cls,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`badge.${kind}`)}
    </span>
  );
}
