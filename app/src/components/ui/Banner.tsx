"use client";

import { FlaskConical, Info, WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

export type BannerKind = "demoLogin" | "testMode" | "offline";

const styles: Record<BannerKind, { cls: string; Icon: typeof Info }> = {
  demoLogin: { cls: "bg-info-soft text-info border-info/30", Icon: Info },
  testMode: { cls: "bg-accent-soft text-text border-accent", Icon: FlaskConical },
  offline: { cls: "bg-danger-soft text-danger border-danger/30", Icon: WifiOff },
};

/** Persistent honesty banners: demo login, test-mode payments, offline (docs/03 §4). */
export function Banner({ kind, className }: { kind: BannerKind; className?: string }) {
  const { bi } = useI18n();
  const { label, caption } = bi(`banner.${kind}`);
  const { cls, Icon } = styles[kind];
  return (
    <div
      role="status"
      className={cn("flex items-start gap-3 rounded-md border px-4 py-3", cls, className)}
    >
      <Icon aria-hidden className="mt-1 size-5 shrink-0" />
      <p className="flex flex-col">
        <span className="font-semibold">{label}</span>
        <span dir="auto" className="text-sm">
          {caption}
        </span>
      </p>
    </div>
  );
}
