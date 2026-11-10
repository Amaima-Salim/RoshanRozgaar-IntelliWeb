import { defineConfig, devices } from "@playwright/test";

// 3000 is often taken on dev machines; E2E gets its own server and port.
const PORT = Number(process.env.E2E_PORT ?? 3200);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "phone", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    // Production build (no dev-mode recompiles/reloads mid-test). Seeds first (idempotent) so demo
    // accounts exist; E2E uses the DATABASE_URL database.
    command: `npm run db:migrate && npm run db:seed && npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { APP_URL: BASE_URL, AUTH_RATE_LIMIT: "off", RR_E2E: "1", AUTH_MODE: "full" },
  },
});
