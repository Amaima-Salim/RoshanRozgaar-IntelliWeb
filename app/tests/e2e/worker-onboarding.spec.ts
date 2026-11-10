import { expect, test, type Page } from "@playwright/test";
import { resetDemoWorker } from "./db";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

const DEMO_WORKER = "03000000010";

test.beforeEach(() => resetDemoWorker());
test.afterAll(() => resetDemoWorker());

/** Signs in the demo worker and waits until onboarding is interactive (redirect + refresh done). */
async function startOnboarding(page: Page) {
  await signInWithDemoAccount(page, "worker", DEMO_WORKER);
  await expect(page).toHaveURL(/\/w\/onboarding$/);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
  await expect(page.getByTestId("question")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function tapThrough(page: Page) {
  await page.getByTestId("trade-electrician").click();
  await page.getByTestId("next").click();
  await page.getByTestId("years").getByRole("button").last().click(); // 1 year
  await page.getByTestId("years").getByRole("button").last().click(); // 2 years
  await page.getByTestId("next").click();
  await page.getByTestId("area-f-7").click();
  await page.getByTestId("area-g-9").click();
  await page.getByTestId("next").click();
  await page.getByTestId("rate-1500").click();
  await page.getByTestId("basis-per_visit").click();
  await page.getByTestId("next").click();
  for (const d of [1, 2, 3, 4, 5]) await page.getByTestId(`day-${d}`).click();
  await page.getByTestId("part-morning").click();
  await page.getByTestId("part-afternoon").click();
  await page.getByTestId("next").click();
  await page.getByTestId("skip").click(); // optional photo
}

test.describe("worker API authorization", () => {
  const profile = {
    trade: "plumber",
    yearsExperience: 3,
    areaSlugs: ["f-7"],
    indicativeRatePkr: 1000,
    rateBasis: "per_hour",
    weekdays: [1],
    dayParts: ["morning"],
    photoMediaId: null,
  };

  test("signed-out callers get 401 from every worker endpoint", async ({ request }) => {
    expect((await request.put("/api/worker/profile", { data: profile })).status()).toBe(401);
    expect(
      (await request.post("/api/worker/availability", { data: { isAvailable: true } })).status(),
    ).toBe(401);
    expect((await request.post("/api/worker/photo")).status()).toBe(401);
  });

  test("a customer session gets 403, and bad input gets 400, never a write", async ({ page }) => {
    await signInWithDemoAccount(page, "customer", "03000000001");
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    expect((await page.request.put("/api/worker/profile", { data: profile })).status()).toBe(403);
    expect(
      (
        await page.request.post("/api/worker/availability", { data: { isAvailable: true } })
      ).status(),
    ).toBe(403);
  });

  test("a worker cannot smuggle extra fields or an unknown area", async ({ page }) => {
    await signInWithDemoAccount(page, "worker", DEMO_WORKER);
    await expect(page).toHaveURL(/\/w\/onboarding$/);
    const extra = await page.request.put("/api/worker/profile", {
      data: { ...profile, role: "customer" },
    });
    expect(extra.status()).toBe(400);
    const area = await page.request.put("/api/worker/profile", {
      data: { ...profile, areaSlugs: ["atlantis"] },
    });
    expect(area.status()).toBe(400);
    const early = await page.request.post("/api/worker/availability", {
      data: { isAvailable: true },
    });
    expect(early.status()).toBe(409); // not onboarded yet
  });

  test("a renamed non-image is refused by the photo endpoint", async ({ page }) => {
    await signInWithDemoAccount(page, "worker", DEMO_WORKER);
    await expect(page).toHaveURL(/\/w\/onboarding$/);
    const res = await page.request.post("/api/worker/photo", {
      multipart: {
        file: { name: "me.jpg", mimeType: "image/jpeg", buffer: Buffer.from("MZ not an image") },
      },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("worker onboarding, tap only (O1)", () => {
  test("demo worker completes a profile with taps and lands on the dashboard", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await signInWithDemoAccount(page, "worker", DEMO_WORKER);
    await expect(page).toHaveURL(/\/w\/onboarding$/);
    // No conventional form: no text inputs anywhere in the flow.
    await expect(page.locator("input[type=text], textarea, form")).toHaveCount(0);

    await tapThrough(page);
    await expect(page.getByTestId("save-profile")).toBeEnabled();
    await expect(page.getByTestId("readback-trade")).toContainText("Electrician");
    await expect(page.getByTestId("readback-rate")).toContainText("Rs 1,500");
    await page.getByTestId("save-profile").click();

    await expect(page).toHaveURL(/\/w\/home$/);
    await expect(page.getByTestId("availability-toggle")).toBeVisible();
    // Finished workers are not sent back through onboarding.
    await open(page, "/w/onboarding");
    await expect(page).toHaveURL(/\/w\/home$/);
  });

  test("Next stays disabled until a required step is answered; a read-back row edits and returns", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await signInWithDemoAccount(page, "worker", DEMO_WORKER);
    await expect(page.getByTestId("next")).toBeDisabled();
    await tapThrough(page);
    await page.getByTestId("readback-trade").click();
    await page.getByTestId("trade-plumber").click();
    await page.getByTestId("next").click(); // returns straight to the read-back
    await expect(page.getByTestId("readback-trade")).toContainText("Plumber");
    await expect(page.getByTestId("save-profile")).toBeVisible();
  });

  test("availability toggle persists across reloads", async ({ page, baseURL }) => {
    await setLanguage(page, baseURL!, "en");
    await signInWithDemoAccount(page, "worker", DEMO_WORKER);
    await tapThrough(page);
    await page.getByTestId("save-profile").click();
    await expect(page).toHaveURL(/\/w\/home$/);
    const toggle = page.getByTestId("availability-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(page.getByTestId("availability-toggle")).toHaveAttribute("aria-checked", "true");
  });

  for (const lang of ["ur", "en"] as const) {
    test(`onboarding + dashboard [${lang}]: no overflow, no serious axe issues`, async ({
      page,
      baseURL,
    }) => {
      await setLanguage(page, baseURL!, lang);
      await signInWithDemoAccount(page, "worker", DEMO_WORKER);
      await expect(page.getByTestId("question")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await tapThrough(page);
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.getByTestId("save-profile").click();
      await expect(page).toHaveURL(/\/w\/home$/);
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});

// Voice-led onboarding with the fake microphone and recorded (fixture) transcripts.
const OFF_URL = `http://localhost:${Number(process.env.E2E_PORT ?? 3200) + 1}`;

async function speak(page: Page) {
  await page.getByRole("button", { name: /Tap to speak/ }).click();
  const accept = page.getByTestId("consent-accept");
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await expect(page.getByRole("button", { name: /Listening/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Listening/ }).click();
}

test.describe("worker onboarding, voice (fixtures)", () => {
  test("voice answers pre-select the tiles; the worker confirms; no form shown", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await startOnboarding(page);
    await expect(page.getByTestId("simulated-ai")).toBeVisible();

    // Consent appears once, before the first mic use.
    await page.getByRole("button", { name: /Tap to speak/ }).click();
    await expect(page.getByTestId("voice-consent")).toBeVisible();
    await page.getByTestId("consent-accept").click();
    await expect(page.getByRole("button", { name: /Listening/ })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Listening/ }).click();
    await expect(page.getByTestId("heard")).toBeVisible();
    await expect(page.getByTestId("trade-electrician")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("next").click();

    await speak(page); // years: "aath saal"
    await expect(page.getByTestId("years-value")).toContainText("8");
    await page.getByTestId("next").click();

    await speak(page); // areas: F-7 + G-9
    await expect(page.getByTestId("area-f-7")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("area-g-9")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("next").click();

    await speak(page); // rate: 1500 per visit
    await expect(page.getByTestId("rate-1500")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("basis-per_visit")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("next").click();

    await speak(page); // schedule: Mon–Fri morning + afternoon
    await expect(page.getByTestId("day-1")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("day-5")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("part-morning")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("next").click();

    await page.getByTestId("skip").click();
    await expect(page.locator("input[type=text], textarea, form")).toHaveCount(0);
    await page.getByTestId("save-profile").click();
    await expect(page).toHaveURL(/\/w\/home$/);
  });

  test("declining the consent notice keeps the tap path working", async ({ page, baseURL }) => {
    await setLanguage(page, baseURL!, "en");
    await startOnboarding(page);
    await page.getByRole("button", { name: /Tap to speak/ }).click();
    await page.getByTestId("consent-decline").click();
    await expect(page.getByTestId("voice-consent")).toHaveCount(0);
    await page.getByTestId("trade-plumber").click();
    await expect(page.getByTestId("next")).toBeEnabled();
  });

  test("AI endpoints refuse signed-out callers and customers", async ({ request, page }) => {
    const body = { stepId: "trade", transcript: "electrician" };
    expect((await request.post("/api/ai/extract-worker-profile", { data: body })).status()).toBe(
      401,
    );
    await signInWithDemoAccount(page, "customer", "03000000001");
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    expect(
      (await page.request.post("/api/ai/extract-worker-profile", { data: body })).status(),
    ).toBe(403);
  });
});

test.describe("worker onboarding with AI_MODE=off", () => {
  test.use({ baseURL: OFF_URL });

  test("no AI affordances, and the tap path still completes", async ({ page, baseURL }) => {
    await setLanguage(page, baseURL!, "en");
    await startOnboarding(page);
    await expect(page.getByTestId("question")).toBeVisible();
    await expect(page.getByTestId("voice-box")).toHaveCount(0);
    await expect(page.getByTestId("simulated-ai")).toHaveCount(0);
    await tapThrough(page);
    await page.getByTestId("save-profile").click();
    await expect(page).toHaveURL(/\/w\/home$/);
  });

  test("AI endpoints report AI_UNAVAILABLE instead of failing silently", async ({ page }) => {
    await startOnboarding(page);
    await expect(page).toHaveURL(/\/w\/onboarding$/);
    const res = await page.request.post("/api/ai/extract-worker-profile", {
      data: { stepId: "trade", transcript: "electrician" },
    });
    expect(res.status()).toBe(503);
    expect((await res.json()).error.code).toBe("AI_UNAVAILABLE");
  });
});
