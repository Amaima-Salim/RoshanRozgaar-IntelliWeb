"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import type { ConversationSummary } from "@/lib/chat/conversations";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { useI18n } from "@/lib/i18n/client";

type Item = Omit<ConversationSummary, "startAt" | "lastAt"> & {
  startAt: string;
  lastAt: string | null;
};

export function ConversationList({
  items,
  role,
  activeId,
  className,
}: {
  items: Item[];
  role: "customer" | "worker";
  activeId?: string;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const base = role === "customer" ? "/c/chat" : "/w/chat";
  if (items.length === 0)
    return (
      <EmptyState
        icon={<MessageCircle />}
        title={t("chat.empty")}
        body={t(role === "customer" ? "chat.emptyCustomer" : "chat.emptyWorker")}
      />
    );
  return (
    <ul className={cn("flex flex-col gap-2", className)} data-testid="conversation-list">
      {items.map((c) => {
        const start = new Date(c.startAt);
        const name = lang === "ur" && c.otherNameUr ? c.otherNameUr : c.otherName;
        return (
          <li key={c.id}>
            <Link
              href={`${base}/${c.id}`}
              aria-current={c.id === activeId ? "page" : undefined}
              className={cn(
                "flex min-h-touch flex-col gap-1 rounded-lg border-2 bg-surface p-3",
                c.id === activeId ? "border-primary bg-primary-soft" : "border-border",
              )}
              data-testid="conversation-link"
            >
              <span className="font-semibold">{name}</span>
              <span className="text-sm text-text-muted">
                {t("chat.jobFor", {
                  trade: t(`trades.${c.trade}`),
                  when: `${formatKarachiDate(start, lang)}, ${formatKarachiTime(start, lang)}`,
                })}
              </span>
              {c.lastText ? (
                <span dir="auto" className="truncate text-sm">
                  {c.lastText}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
