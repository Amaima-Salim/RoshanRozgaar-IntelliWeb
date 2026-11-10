"use client";

import { CircleCheck, CircleX, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./cn";

export type Status = "pending" | "success" | "failed";

const styles = {
  pending: { cls: "bg-info-soft text-info", Icon: Clock },
  success: { cls: "bg-primary-soft text-primary-strong", Icon: CircleCheck },
  failed: { cls: "bg-danger-soft text-danger", Icon: CircleX },
} as const;

/** Pending, success and failed always look different, with an icon and text (docs/03 §1.4). */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { cls, Icon } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium",
        cls,
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label ?? t(`status.${status}`)}
    </span>
  );
}
