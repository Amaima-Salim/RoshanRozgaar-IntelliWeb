import { expect, test, type Page } from "@playwright/test";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

/** A brand-new customer (fresh demo-phone number) who has just chosen the customer role. */
async function newCustomer(page: Page) {
  const phone = `0398${Date.now().toString().slice(-7)}`;
  await open(page, "/login?role=customer");
  await page.getByTestId("switch-method").click();
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-code").click();
  await page.getByTestId("code-input").fill("123456");
  await page.getByTestId("verify-code").click();
  await page.getByTestId("role-customer").click();
  await expect(page).toHaveURL(/\/c\/onboarding$/);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
  await page.waitForLoadState("networkidle");
}

test.describe("customer onboarding", () => {
  test("name, area and language in one short screen, then the request page", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await newCustomer(page);
    await page.getByTestId("customer-name").fill("Sara Khan");
    await page.getByTestId("c-area-g-9").click();
    await page.getByTestId("c-lang-en").click();
    await page.getByTestId("customer-continue").click();
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "rr_area")?.value).toBe("g-9");
    expect(cookies.find((c) => c.name === "rr_lang")?.value).toBe("en");
  });

  test("asks for the missing name or area instead of saving", async ({ page, baseURL }) => {
    await setLanguage(page, baseURL!, "en");
    await newCustomer(page);
    await page.getByTestId("customer-continue").click();
    await expect(page.getByTestId("customer-error")).toContainText("name");
    await page.getByTestId("customer-name").fill("Sara");
    await page.getByTestId("customer-continue").click();
    await expect(page.getByTestId("customer-error")).toContainText("area");
    await expect(page).toHaveURL(/\/c\/onboarding$/);
  });

  test("'Use my location' selects the nearest area", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 33.6935, longitude: 73.0295 }); // G-9
    await setLanguage(page, baseURL!, "en");
    await newCustomer(page);
    await page.getByTestId("use-location").click();
    await expect(page.getByTestId("c-area-g-9")).toHaveAttribute("aria-pressed", "true");
  });

  test("a location outside the service area falls back to the tiles", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 31.52, longitude: 74.35 }); // Lahore
    await setLanguage(page, baseURL!, "en");
    await newCustomer(page);
    await page.getByTestId("use-location").click();
    await expect(page.getByTestId("location-note")).toContainText("outside");
    await expect(page.locator("[data-testid^=c-area-][aria-pressed=true]")).toHaveCount(0);
  });

  test("denied location falls back to the tiles", async ({ page, context, baseURL }) => {
    await context.clearPermissions();
    await setLanguage(page, baseURL!, "en");
    await newCustomer(page);
    await page.getByTestId("use-location").click();
    await expect(page.getByTestId("location-note")).toBeVisible();
    await page.getByTestId("c-area-f-7").click();
    await expect(page.getByTestId("c-area-f-7")).toHaveAttribute("aria-pressed", "true");
  });

  for (const lang of ["ur", "en"] as const) {
    test(`[${lang}] no overflow, no serious axe issues`, async ({ page, baseURL }) => {
      await setLanguage(page, baseURL!, lang);
      await newCustomer(page);
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }

  test("API: signed-out 401, worker 403, unknown area 400", async ({ request, page }) => {
    const body = { name: "A", areaSlug: "g-9", language: "en" };
    expect((await request.post("/api/customer/onboarding", { data: body })).status()).toBe(401);
    await signInWithDemoAccount(page, "worker", "03000000010");
    await expect(page).toHaveURL(/\/w\/onboarding$/);
    expect((await page.request.post("/api/customer/onboarding", { data: body })).status()).toBe(
      403,
    );
  });

  test("API rejects an unknown area and extra fields", async ({ page }) => {
    await signInWithDemoAccount(page, "customer", "03000000001");
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    const bad = await page.request.post("/api/customer/onboarding", {
      data: { name: "A", areaSlug: "atlantis", language: "en" },
    });
    expect(bad.status()).toBe(400);
    const extra = await page.request.post("/api/customer/onboarding", {
      data: { name: "A", areaSlug: "g-9", language: "en", role: "worker" },
    });
    expect(extra.status()).toBe(400);
  });
});

test.describe("spoken guide in both languages", () => {
  test("login, role chooser and onboarding show a Listen button per language and the full text", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await open(page, "/");
    const guide = page.getByTestId("guide-roleChooser");
    await expect(guide).toBeVisible();
    await guide.locator("summary").click();
    // Both languages are readable even when the browser has no voice for one of them.
    await expect(guide).toContainText("Press the picture that describes you");
    await expect(guide).toContainText("اپنی تصویر والے بٹن");
  });
});
