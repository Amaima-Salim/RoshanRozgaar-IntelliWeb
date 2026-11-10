import { expect, test, type Page } from "@playwright/test";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  isPhone,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

const CUSTOMER_1 = "03000000001"; // Ayesha Khan, G-9

/** "YYYY-MM-DDTHH:mm" for the next given weekday (0 = Sunday), at least three days away. */
function nextWeekday(weekday: number, time: string) {
  const d = new Date(Date.now() + 3 * 24 * 3600_000);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

async function startRequest(page: Page, trade: string, whenValue: string) {
  await signInWithDemoAccount(page, "customer", CUSTOMER_1);
  await expect(page).toHaveURL(/\/c\/request\/new$/);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
  await page.getByTestId(`trade-${trade}`).click();
  await page.getByTestId("when-pick").click();
  await page.getByTestId("when-pick-input").fill(whenValue);
  await page.getByTestId("req-area-g-9").click();
  await page.getByTestId("request-submit").click();
}

test.describe("customer discovery", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await setLanguage(page, baseURL!, "en");
  });

  test("tap request → ranked workers who are free, with reasons", async ({ page }) => {
    await startRequest(page, "electrician", nextWeekday(3, "10:00"));
    await expect(page).toHaveURL(/\/c\/request\/[0-9a-f-]{36}$/);
    const cards = page.getByTestId("candidate");
    await expect(cards.first()).toBeVisible();
    const text = await page.getByTestId("results-list").innerText();
    expect(text).toContain("Naveed Akhtar"); // nearby, free, long enough hours
    expect(text).not.toContain("Imran Qureshi"); // ~14 km away (edge case 1)
    expect(text).not.toContain("Usman Tariq"); // works from 14:00 only
    await expect(cards.first()).toContainText("km from you");
    await expect(cards.first()).toContainText("Free at");
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });

  test("a new worker is shown honestly as having no reviews", async ({ page }) => {
    await startRequest(page, "electrician", nextWeekday(3, "16:00"));
    const usman = page.getByTestId("candidate").filter({ hasText: "Usman Tariq" });
    await expect(usman).toContainText("No reviews yet");
  });

  test("nobody free → honest no-match with next steps", async ({ page }) => {
    await startRequest(page, "electrician", nextWeekday(3, "03:00"));
    await expect(page.getByTestId("no-match")).toBeVisible();
    await expect(page.getByTestId("candidate")).toHaveCount(0);
    await expect(page.getByTestId("change-time")).toBeVisible();
    await page.getByTestId("widen-radius").click();
    await expect(page).toHaveURL(/radius=20/);
    await expect(page.getByTestId("no-match")).toBeVisible(); // still honest: no one works at 03:00
  });

  test("a worker's profile opens from the results", async ({ page }) => {
    await startRequest(page, "electrician", nextWeekday(3, "10:00"));
    await page.getByTestId("view-worker").first().click();
    await expect(page.getByTestId("worker-profile")).toBeVisible();
    await expect(page.getByTestId("typical-price")).toContainText("Rs");
    await expect(page.getByTestId("message-worker")).toBeDisabled();
    await expectAccessible(page);
  });

  test("map and list: side by side on desktop, switchable on a phone", async ({ page }) => {
    await startRequest(page, "electrician", nextWeekday(3, "10:00"));
    await expect(page.getByTestId("results-list")).toBeVisible();
    if (isPhone(page)) {
      await expect(page.getByTestId("results-map")).toBeHidden();
      await page.getByTestId("switch-map").click();
      await expect(page.getByTestId("results-map")).toBeVisible();
      await expect(page.getByTestId("results-list")).toBeHidden();
      await page.getByTestId("switch-list").click();
      await expect(page.getByTestId("results-list")).toBeVisible();
    } else {
      await expect(page.getByTestId("results-map")).toBeVisible();
    }
  });

  test("asks for the missing work type", async ({ page }) => {
    await signInWithDemoAccount(page, "customer", CUSTOMER_1);
    await expect(page).toHaveURL(/\/c\/request\/new$/);
    await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-error")).toContainText("kind of work");
  });
});

test("the request page works in Urdu (RTL)", async ({ page, baseURL }) => {
  await setLanguage(page, baseURL!, "ur");
  await signInWithDemoAccount(page, "customer", CUSTOMER_1);
  await expect(page).toHaveURL(/\/c\/request\/new$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await open(page, "/c/request/new");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
});
