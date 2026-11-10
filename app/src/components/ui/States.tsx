"use client";

import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "./Button";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-border/60", className)} />;
}

/** Empty states always offer a next step (docs/03 §4). */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title?: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface p-8 text-center">
      <span aria-hidden className="text-text-muted [&_svg]:size-10">
        {icon ?? <Inbox />}
      </span>
      <p className="text-lg font-semibold">{title ?? t("state.emptyTitle")}</p>
      {body ? <p className="max-w-prose text-text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

/** Errors come with a retry, and a non-AI path where one exists (docs/03 §4). */
export function ErrorState({
  title,
  body,
  onRetry,
  alternative,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  alternative?: ReactNode;
}) {
  const { t, bi } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-6 text-center"
    >
      <AlertTriangle aria-hidden className="size-10 text-danger" />
      <p className="text-lg font-semibold text-danger">{title ?? t("state.errorTitle")}</p>
      {body ? <p className="max-w-prose">{body}</p> : null}
      <div className="flex flex-wrap justify-center gap-3">
        {onRetry ? (
          <Button
            variant="outline"
            icon={<RotateCcw aria-hidden className="size-5" />}
            onClick={onRetry}
            {...bi("state.retry")}
          />
        ) : null}
        {alternative}
      </div>
    </div>
  );
}
