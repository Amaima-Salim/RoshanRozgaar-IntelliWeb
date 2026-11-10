import { defineConfig, devices } from "@playwright/test";

// 3000 is often taken on dev machines; E2E gets its own servers and ports.
const PORT = Number(process.env.E2E_PORT ?? 3200);
const OFF_PORT = PORT + 1;
const BASE_URL = `http://localhost:${PORT}`;
const OFF_URL = `http://localhost:${OFF_PORT}`;
const RUN = Date.now();
const READY = `.e2e-ready-${RUN}`;

// Chromium's fake microphone, so the voice flow can be exercised without hardware.
const fakeMic = {
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure", ...fakeMic },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...fakeMic },
    },
    { name: "phone", use: { ...devices["Pixel 5"], ...fakeMic } },
  ],
  webServer: [
    {
      // Production build (no dev-mode recompiles/reloads mid-test). Seeds first (idempotent) so demo
      // accounts exist. AI runs in `fixtures` mode (recorded transcripts, "Simulated AI" badge).
      command: `npm run db:migrate && npm run db:seed && npm run build && touch ${READY} && npx next start -p ${PORT}`,
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        APP_URL: BASE_URL,
        AUTH_RATE_LIMIT: "off",
        RR_E2E: "1",
        AUTH_MODE: "full",
        AI_MODE: "fixtures",
      },
    },
    {
      // Same build, AI switched off: proves the whole flow still completes with taps (AI_MODE=off).
      command: `until [ -f ${READY} ]; do sleep 1; done; npx next start -p ${OFF_PORT}`,
      url: `${OFF_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        APP_URL: OFF_URL,
        AUTH_RATE_LIMIT: "off",
        RR_E2E: "1",
        AUTH_MODE: "full",
        AI_MODE: "off",
      },
    },
  ],
});
