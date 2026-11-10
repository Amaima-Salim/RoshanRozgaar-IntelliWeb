"use client";

import { Hammer, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";

type Role = "worker" | "customer";

const ROLES: {
  role: Role;
  Icon: typeof Hammer;
  title: "landing.workerTitle" | "landing.customerTitle";
  hint: "landing.workerHint" | "landing.customerHint";
}[] = [
  { role: "customer", Icon: Search, title: "landing.customerTitle", hint: "landing.customerHint" },
  { role: "worker", Icon: Hammer, title: "landing.workerTitle", hint: "landing.workerHint" },
];

/**
 * Two big role cards (Figma 01). Signed out: each links to /login for that role.
 * Signed in without a role: picking one sets it once on the server (docs/05 §6).
 */
export function RoleChooser({ mode }: { mode: "link" | "assign" }) {
  const { t, bi } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const assign = (role: Role) =>
    startTransition(async () => {
      setError(false);
      const res = await fetch("/api/me/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      }).catch(() => null);
      if (!res?.ok) {
        setError(true);
        return;
      }
      router.replace(role === "worker" ? "/w/home" : "/c/request/new");
      router.refresh();
    });

  const cardClass =
    "flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-border bg-surface p-6 text-center transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-60";

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 md:grid-cols-2">
        {ROLES.map(({ role, Icon, title, hint }) => {
          const { label, caption } = bi(title);
          const body = (
            <>
              <span className="flex size-16 items-center justify-center rounded-pill bg-primary-soft text-primary">
                <Icon aria-hidden className="size-8" />
              </span>
              <span className="flex flex-col">
                <span className="text-xl font-bold">{label}</span>
                <span dir="auto" className="text-sm text-text-muted">
                  {caption}
                </span>
              </span>
              <span className="text-text-muted">{t(hint)}</span>
            </>
          );
          return (
            <li key={role}>
              {mode === "link" ? (
                <Link
                  href={`/login?role=${role}`}
                  className={cardClass}
                  data-testid={`role-${role}`}
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => assign(role)}
                  className={cn(cardClass)}
                  data-testid={`role-${role}`}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {mode === "assign" ? (
        <p
          aria-live="polite"
          className={cn(
            "text-center text-sm",
            error ? "font-semibold text-danger" : "text-text-muted",
          )}
        >
          {pending
            ? t("landing.roleSaving")
            : error
              ? t("landing.roleError")
              : t("landing.pickRoleOnce")}
        </p>
      ) : null}
    </div>
  );
}
