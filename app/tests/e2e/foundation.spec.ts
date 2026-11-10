import { expect, test } from "@playwright/test";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  isPhone,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

const DEMO_WORKER = "03000000010";
const DEMO_CUSTOMER = "03000000001";

test.describe("shell, language and layout", () => {
  for (const lang of ["ur", "en"] as const) {
    for (const path of [
      "/",
      "/login?role=worker",
      "/login?role=customer",
      "/dev/components?frame=1",
    ]) {
      test(`${path} [${lang}] has correct dir, no horizontal scroll, no serious axe issues`, async ({
        page,
        baseURL,
      }) => {
        await setLanguage(page, baseURL!, lang);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(page.locator("html")).toHaveAttribute("dir", lang === "ur" ? "rtl" : "ltr");
        await expectNoHorizontalScroll(page);
        await expectAccessible(page);
      });
    }
  }

  test("NavBar on ≥768 px, TopBar + BottomTabs below it", async ({ page }) => {
    await open(page, "/");
    await expect(page.locator("header.md\\:block")).toBeVisible({ visible: !isPhone(page) });
    await expect(page.locator("header.md\\:hidden")).toBeVisible({ visible: isPhone(page) });
  });

  test("the chrome switches exactly at 768 px", async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    await open(page, "/");
    await expect(page.locator("header.md\\:hidden")).toBeVisible();
    await expect(page.locator("header.md\\:block")).toBeHidden();
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.locator("header.md\\:block")).toBeVisible();
    await expect(page.locator("header.md\\:hidden")).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test("language toggle flips lang and dir, and keeps the page", async ({ page, baseURL }) => {
    await setLanguage(page, baseURL!, "ur");
    await open(page, "/login?role=worker");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByTestId("language-toggle").locator("visible=true").first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL(/\/login\?role=worker/);
    await page.getByTestId("language-toggle").locator("visible=true").first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("demo phone login and role routing", () => {
  test.beforeEach(async ({ page, baseURL }) => setLanguage(page, baseURL!, "en"));

  test("shows the demo-login banner and the not-verification note", async ({ page }) => {
    await open(page, "/login?role=worker");
    await expect(page.getByText("Demo login — no real SMS is sent.")).toBeVisible();
    await expect(page.getByText("Sign-in is not identity verification.")).toBeVisible();
  });

  test("one-tap demo worker lands on /w/home; customer pages redirect back", async ({ page }) => {
    await signInWithDemoAccount(page, "worker", DEMO_WORKER);
    await expect(page).toHaveURL(/\/w\/home$/);
    await expect(page.getByTestId("phase-placeholder")).toBeVisible();
    await open(page, "/c/request/new");
    await expect(page).toHaveURL(/\/w\/home$/);
  });

  test("one-tap demo customer lands on /c/request/new; worker pages redirect back", async ({
    page,
  }) => {
    await signInWithDemoAccount(page, "customer", DEMO_CUSTOMER);
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    await open(page, "/w/home");
    await expect(page).toHaveURL(/\/c\/request\/new$/);
  });

  test("signed-out visit to a worker page goes to login, then back after sign-in", async ({
    page,
  }) => {
    await open(page, "/w/profile");
    await expect(page).toHaveURL(/\/login\?role=worker&next=%2Fw%2Fprofile/);
    await page.getByTestId(`demo-${DEMO_WORKER}`).click();
    await expect(page).toHaveURL(/\/w\/profile$/);
  });

  test("keypad flow: wrong code shows an honest error, right code signs in", async ({ page }) => {
    await open(page, "/login?role=worker");
    for (const d of "03000000010")
      await page.getByTestId("keypad").getByRole("button", { name: d, exact: true }).click();
    await page.getByTestId("send-code").click();
    await page.getByTestId("code-input").fill("000000");
    await page.getByTestId("verify-code").click();
    await expect(page.getByTestId("login-error")).toHaveText(/Wrong code\. 4 tries left\./);
    await page.getByTestId("code-input").fill("123456");
    await page.getByTestId("verify-code").click();
    await expect(page).toHaveURL(/\/w\/home$/);
  });

  test("invalid phone keeps the send button disabled", async ({ page }) => {
    await open(page, "/login?role=worker");
    await page.getByTestId("phone-input").fill("1234");
    await expect(page.getByTestId("send-code")).toBeDisabled();
  });

  test("a new phone number chooses a role once, then lands in that area", async ({ page }) => {
    const phone = `0399${Date.now().toString().slice(-7)}`;
    await open(page, "/login?role=customer");
    await page.getByTestId("phone-input").fill(phone);
    await page.getByTestId("send-code").click();
    await page.getByTestId("code-input").fill("123456");
    await page.getByTestId("verify-code").click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId("role-customer").click();
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    // The role is now fixed: the chooser no longer appears.
    await open(page, "/");
    await expect(page).toHaveURL(/\/c\/request\/new$/);
  });

  test("sign-out ends the session", async ({ page }) => {
    await signInWithDemoAccount(page, "customer", DEMO_CUSTOMER);
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    await page.getByRole("button", { name: "Sign out" }).locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/$/);
    await open(page, "/c/request/new");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("/api/health reports DB ok without secrets", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.checks).toEqual({ config: "ok", database: "ok" });
  expect(JSON.stringify(body)).not.toMatch(/secret|password|postgres:\/\//i);
});
