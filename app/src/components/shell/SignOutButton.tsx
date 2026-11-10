"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";

/** Invalidates the server session (docs/05 §6), then returns to the landing page. */
export function SignOutButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.replace("/");
          router.refresh();
        })
      }
      aria-label={compact ? t("nav.signOut") : undefined}
      className={cn(
        "inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-pill px-3 font-medium text-text-muted hover:bg-canvas",
        className,
      )}
    >
      <LogOut aria-hidden className="size-5 rtl:-scale-x-100" />
      {compact ? null : <span>{t("nav.signOut")}</span>}
    </button>
  );
}
