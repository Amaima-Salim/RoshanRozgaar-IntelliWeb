import { execSync } from "node:child_process";

/** Re-seeds (idempotent) so the demo worker is un-onboarded again. */
export function resetDemoWorker() {
  execSync("npm run db:seed", { stdio: "ignore" });
}
