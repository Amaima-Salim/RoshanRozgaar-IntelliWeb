"use client";

import { Delete } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

/** Big numeric keypad (docs/01 §3): digits never mirror, so the grid is forced LTR. */
export function Keypad({
  onDigit,
  onDelete,
  onClear,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const key =
    "flex h-16 items-center justify-center rounded-lg bg-canvas text-2xl font-semibold hover:bg-primary-soft active:bg-primary-soft";
  return (
    <div dir="ltr" className="grid grid-cols-3 gap-2" data-testid="keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className={`${key} num`} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" className={`${key} px-1 text-sm leading-tight`} onClick={onClear}>
        {t("login.keypadClear")}
      </button>
      <button type="button" className={`${key} num`} onClick={() => onDigit("0")}>
        0
      </button>
      <button type="button" className={key} onClick={onDelete} aria-label={t("login.keypadDelete")}>
        <Delete aria-hidden className="size-7" />
      </button>
    </div>
  );
}
