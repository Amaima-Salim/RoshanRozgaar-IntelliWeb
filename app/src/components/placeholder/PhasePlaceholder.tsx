import { Construction } from "lucide-react";
import type { Role } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

/**
 * Honest stand-in for a screen a later phase builds: says so plainly instead of
 * faking content. Removed as each phase lands (DECISIONS.md D-41).
 */
export async function PhasePlaceholder({ role }: { role: Role }) {
  const { t } = await getT();
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-10 text-center"
      data-testid="phase-placeholder"
    >
      <Construction aria-hidden className="size-10 text-text-muted" />
      <h1 className="text-2xl font-bold">{t("placeholder.title")}</h1>
      <p className="max-w-prose text-text-muted">
        {t("placeholder.body", { role: t(`placeholder.${role}`) })}
      </p>
    </div>
  );
}
