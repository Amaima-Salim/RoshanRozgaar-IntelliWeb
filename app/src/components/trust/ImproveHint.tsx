import { Lightbulb } from "lucide-react";
import { MIN_SIGNAL_SAMPLE, weakestSignal, type TrustStats } from "@/lib/domain/trust";
import { getT } from "@/lib/i18n/server";

/**
 * "How to improve" for the worker, derived only from real tap-signal rates (docs/01 O5). It never
 * invents a problem: with too few answers it says so, and with no weak signal it says keep going.
 */
export async function ImproveHint({ stats }: { stats: TrustStats }) {
  const { t } = await getT();
  const weak = weakestSignal(stats.rates);
  const answered = Math.max(...Object.values(stats.rates).map((r) => r.total));
  const text = weak
    ? t(`trust.worker.hint.${weak}`)
    : answered >= MIN_SIGNAL_SAMPLE
      ? t("trust.worker.keepGoing")
      : t("trust.worker.needMore");
  return (
    <div
      className="flex items-start gap-3 rounded-lg bg-accent-soft p-3"
      data-testid="improve-hint"
    >
      <Lightbulb aria-hidden className="mt-1 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{t("trust.worker.improve")}</p>
        <p data-testid="improve-text">{text}</p>
      </div>
    </div>
  );
}
