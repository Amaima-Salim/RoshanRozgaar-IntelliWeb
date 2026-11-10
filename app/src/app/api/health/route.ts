import { getConfig } from "@/lib/config";
import { getSqlClient } from "@/lib/db/client";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Public liveness check: DB ping + which modes are active. Never returns secrets. */
export async function GET() {
  let configOk = true;
  let modes: Record<string, string> = {};
  try {
    const c = getConfig();
    modes = { auth: c.auth.mode, ai: c.ai.mode, payments: c.payments.mode };
  } catch (err) {
    configOk = false;
    log.error("health.config", { error: err });
  }

  let dbOk = false;
  if (configOk) {
    try {
      const client = getSqlClient();
      await Promise.race([
        client`select 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]);
      dbOk = true;
    } catch (err) {
      log.error("health.db", { error: err });
    }
  }

  const healthy = configOk && dbOk;
  return Response.json(
    {
      ok: healthy,
      checks: { config: configOk ? "ok" : "error", database: dbOk ? "ok" : "error" },
      modes,
    },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
