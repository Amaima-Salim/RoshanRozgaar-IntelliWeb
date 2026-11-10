import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, open, setLanguage } from "./helpers";

// The E2E server (RR_E2E=1) emails nothing and always issues this code.
const E2E_CODE = "424242";
const freshEmail = () => `e2e${Date.now()}${Math.floor(Math.random() * 1000)}@example.test`;

test.describe("customer email code", () => {
  test("email → 6 boxes → role chooser → customer onboarding", async ({ page }) => {
    await open(page, "/login?role=customer");
    await expect(page.getByTestId("email-input")).toBeVisible();
    await page.getByTestId("email-input").fill(freshEmail());
    await page.getByTestId("send-email-code").click();
    await expect(page.getByTestId("email-sent")).toBeVisible();
    for (let i = 0; i < 6; i++) await page.getByTestId(`otp-box-${i}`).fill(E2E_CODE[i]!);
    // New user has no role yet: the role chooser appears, the choice is stored once.
    await expect(page.getByTestId("role-customer")).toBeVisible();
    await page.getByTestId("role-customer").click();
    await expect(page).toHaveURL(/\/c\/onboarding/);
  });

  test("a wrong code shows an honest error and keeps you on the code step", async ({ page }) => {
    await open(page, "/login?role=customer");
    await page.getByTestId("email-input").fill(freshEmail());
    await page.getByTestId("send-email-code").click();
    await expect(page.getByTestId("email-sent")).toBeVisible();
    for (let i = 0; i < 6; i++) await page.getByTestId(`otp-box-${i}`).fill("000000"[i]!);
    await expect(page.getByTestId("email-error")).not.toBeEmpty();
    await expect(page).toHaveURL(/\/login/);
  });

  for (const lang of ["ur", "en"] as const) {
    test(`login screens [${lang}] have no overflow and no serious axe issues`, async ({
      page,
      baseURL,
    }) => {
      await setLanguage(page, baseURL!, lang);
      for (const role of ["customer", "worker"]) {
        await open(page, `/login?role=${role}`);
        await expectNoHorizontalScroll(page);
        await expectAccessible(page);
      }
    });
  }
});

test("sign-in never claims identity verification", async ({ page, baseURL }) => {
  await setLanguage(page, baseURL!, "en");
  await open(page, "/login?role=worker");
  await expect(page.locator("body")).toContainText("Sign-in is not identity verification");
});

test("secrets never reach client bundles", () => {
  const env = path.join(process.cwd(), ".env.local");
  let values: string[] = [];
  try {
    values = readFileSync(env, "utf8")
      .split("\n")
      .filter((l) => /^(GOOGLE_CLIENT_SECRET|GMAIL_APP_PASSWORD|SESSION_SECRET)=/.test(l))
      .map((l) => l.slice(l.indexOf("=") + 1).trim())
      .filter((v) => v.length >= 8);
  } catch {
    test.skip(true, "no .env.local to compare against");
  }
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const files = walk(path.join(process.cwd(), ".next", "static"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const v of values) expect(text.includes(v), `${f} leaks a secret`).toBe(false);
  }
});
