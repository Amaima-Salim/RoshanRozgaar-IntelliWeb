import { existsSync } from "node:fs";
import { loadEnvConfig } from "@next/env";

/** Scripts (migrate/seed/reset) read .env.local the same way Next does. */
export function loadEnvFiles() {
  if (existsSync(".env.local") || existsSync(".env")) loadEnvConfig(process.cwd());
}
