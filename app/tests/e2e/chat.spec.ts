import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

const CUSTOMER_1 = "03000000001";
const NAVEED = "03000000102"; // w-elec-3: nearby electrician, free on weekdays 9-18

function nextWednesday(time: string) {
  const d = new Date(Date.now() + 3 * 24 * 3600_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

async function setUserLanguage(page: Page, language: "ur" | "en") {
  const res = await page.request.post("/api/me/language", { data: { language } });
  expect(res.ok()).toBeTruthy();
}

/** Customer: request → results → Naveed's profile → Message. Lands in the chat. */
async function customerOpensChat(page: Page) {
  await signInWithDemoAccount(page, "customer", CUSTOMER_1);
  await expect(page).toHaveURL(/\/c\/request\/new$/);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
  await page.getByTestId("trade-electrician").click();
  await page.getByTestId("when-pick").click();
  await page.getByTestId("when-pick-input").fill(nextWednesday("10:00"));
  await page.getByTestId("req-area-g-9").click();
  await page.getByTestId("request-submit").click();
  await page
    .getByTestId("candidate")
    .filter({ hasText: "Naveed Akhtar" })
    .getByTestId("view-worker")
    .click();
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
  await page.getByTestId("message-worker").click();
  await expect(page).toHaveURL(/\/c\/chat\/[0-9a-f-]{36}$/);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

async function workerSession(browser: Browser, baseURL: string, lang: "ur" | "en") {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await setLanguage(page, baseURL, lang);
  await open(page, "/login?role=worker");
  await page.getByTestId("phone-input").fill(NAVEED); // workers start on the phone form
  await page.getByTestId("send-code").click();
  await page.getByTestId("code-input").fill("123456");
  await page.getByTestId("verify-code").click();
  await expect(page).toHaveURL(/\/w\/home$/);
  return { context, page };
}

test.describe("chat (two people)", () => {
  test("customer and worker exchange messages; quick replies arrive in the reader's language", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await setLanguage(page, baseURL!, "ur");
    await customerOpensChat(page);
    await setUserLanguage(page, "ur");
    await expectNoHorizontalScroll(page);

    // Quick reply, in Urdu on the customer's screen.
    await page.getByTestId("quick-when").click();
    await expect(page.getByTestId("message").first()).toContainText("آپ کب آ سکتے ہیں؟");
    await page.getByTestId("chat-input").fill("Fan band hai");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("message")).toHaveCount(2);

    const worker = await workerSession(browser, baseURL!, "en");
    await setUserLanguage(worker.page, "en");
    await open(worker.page, "/w/chat");
    await worker.page.getByTestId("conversation-link").first().click();
    // The worker reads the quick reply in English, with the Urdu original underneath.
    await expect(worker.page.getByTestId("message").first()).toContainText("When can you come?");
    await expect(worker.page.getByTestId("message").first()).toContainText("آپ کب آ سکتے ہیں؟");
    await expect(worker.page.getByTestId("message").nth(1)).toContainText("Fan band hai");
    await worker.page.getByTestId("quick-canCome").click();

    // Polling brings the reply to the customer without a reload (every 4 s).
    await expect(page.getByTestId("message")).toHaveCount(3, { timeout: 15_000 });
    await expect(page.getByTestId("message").nth(2)).toContainText("میں اس وقت آ سکتا ہوں۔");
    await expectAccessible(page);
    await worker.context.close();
  });

  test("a failed send stays visible, retries once, and never duplicates", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await customerOpensChat(page);
    let blocked = true;
    await page.route("**/api/conversations/*/messages", async (route) => {
      if (route.request().method() === "POST" && blocked) return route.abort();
      return route.continue();
    });
    await page.getByTestId("chat-input").fill("Hello there");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("retry-send")).toBeVisible();
    blocked = false;
    await page.getByTestId("retry-send").click();
    await expect(page.getByTestId("retry-send")).toHaveCount(0);
    await expect(page.getByTestId("message")).toHaveCount(1);
    // Polling later must not show it twice.
    await page.waitForTimeout(4500);
    await expect(page.getByTestId("message")).toHaveCount(1);
  });

  test("strangers cannot read or write a conversation", async ({ page, browser, baseURL }) => {
    await setLanguage(page, baseURL!, "en");
    await customerOpensChat(page);
    const id = page.url().split("/").pop()!;
    const other = await browser.newContext({ baseURL });
    const stranger = await other.newPage();
    await signInWithDemoAccount(stranger, "customer", "03000000002");
    await expect(stranger).toHaveURL(/\/c\/request\/new$/);
    expect((await stranger.request.get(`/api/conversations/${id}/messages`)).status()).toBe(404);
    expect(
      (
        await stranger.request.post(`/api/conversations/${id}/messages`, {
          data: { kind: "text", clientMsgId: "abcdefgh1234", bodyText: "hi" },
        })
      ).status(),
    ).toBe(404);
    expect((await stranger.goto(`/c/chat/${id}`))?.status()).toBe(404);
    await other.close();
  });

  test("signed-out callers are refused", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await request.get(`/api/conversations/${id}/messages`)).status()).toBe(401);
    expect((await request.post("/api/conversations", { data: {} })).status()).toBe(401);
  });
});
