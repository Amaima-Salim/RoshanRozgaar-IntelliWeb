import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

const CUSTOMER_1 = "03000000001";
const NAVEED = "03000000102";

function nextWednesday(time: string) {
  const d = new Date(Date.now() + 3 * 24 * 3600_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

async function hydrated(page: Page) {
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

async function customerOpensChat(page: Page) {
  await signInWithDemoAccount(page, "customer", CUSTOMER_1);
  await expect(page).toHaveURL(/\/c\/request\/new$/);
  await hydrated(page);
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
  await hydrated(page);
  await page.getByTestId("message-worker").click();
  await expect(page).toHaveURL(/\/c\/chat\/[0-9a-f-]{36}$/);
  await hydrated(page);
}

async function workerSession(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, permissions: ["microphone"] });
  const page = await context.newPage();
  await setLanguage(page, baseURL, "en");
  await open(page, "/login?role=worker");
  await page.getByTestId("phone-input").fill(NAVEED);
  await page.getByTestId("send-code").click();
  await page.getByTestId("code-input").fill("123456");
  await page.getByTestId("verify-code").click();
  await expect(page).toHaveURL(/\/w\/home$/);
  return { context, page };
}

test.describe("chat voice notes and offers (two people)", () => {
  test("voice note → AI transcript + translation → offer → counter → card states", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await setLanguage(page, baseURL!, "en");
    await customerOpensChat(page);
    expect((await page.request.post("/api/me/language", { data: { language: "en" } })).ok()).toBe(
      true,
    );
    await page.getByTestId("quick-when").click(); // gives the worker a thread to open

    const worker = await workerSession(browser, baseURL!);
    const w = worker.page;
    await open(w, "/w/chat");
    await w.getByTestId("conversation-link").first().click();
    await hydrated(w);

    // Worker records a voice note with the fake microphone.
    await w.getByTestId("voice-record").click();
    await expect(w.getByTestId("voice-timer")).toBeVisible();
    await w.waitForTimeout(1500);
    await w.getByTestId("voice-stop").click();
    const mine = w.getByTestId("voice-message").first();
    await expect(mine).toBeVisible({ timeout: 15_000 });
    await expect(mine.locator("audio")).toHaveCount(1);
    await expect(mine.getByTestId("voice-transcript")).toBeVisible();

    // Customer sees it by polling, with the translation, labelled as AI.
    const note = page.getByTestId("voice-message").first();
    await expect(note).toBeVisible({ timeout: 15_000 });
    await expect(note.getByTestId("voice-translation")).toContainText("fifteen hundred");
    await expect(note).toContainText("AI");
    await expectNoHorizontalScroll(page);

    // The customer drafts an offer from the note: the amount is a labelled draft they must send.
    await note.getByTestId("offer-from-voice").click();
    await expect(page.getByTestId("offer-composer")).toBeVisible();
    await expect(page.getByTestId("offer-ai-draft")).toBeVisible();
    await expect(page.getByTestId("offer-card")).toHaveCount(0); // nothing sent yet
    await expectAccessible(page);
    await page.getByTestId("offer-send").click();
    await expect(page.getByTestId("offer-card")).toHaveCount(1);
    await expect(page.getByTestId("offer-card-price")).toContainText("1,500");

    // The worker sees the card, counters at a different price.
    const wcard = w.getByTestId("offer-card").first();
    await expect(wcard).toBeVisible({ timeout: 15_000 });
    await wcard.getByTestId("offer-counter").click();
    await w.getByTestId("offer-price-custom").fill("1800");
    await w.getByTestId("offer-send").click();
    await expect(w.getByTestId("offer-card")).toHaveCount(2);
    await expect(w.getByTestId("offer-card").first()).toHaveAttribute("data-status", "countered");

    // The customer's own card flips to countered, and a new pending card arrives.
    await expect(page.getByTestId("offer-card")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId("offer-card").first()).toHaveAttribute(
      "data-status",
      "countered",
    );
    await expect(page.getByTestId("offer-card").nth(1)).toContainText("1,800");
    await expect(page.getByTestId("offer-accept")).toBeVisible();
    await worker.context.close();
  });
});

const OFF_URL = `http://localhost:${Number(process.env.E2E_PORT ?? 3200) + 1}`;

test.describe("chat with AI switched off", () => {
  test.use({ baseURL: OFF_URL });

  test("a voice note stays audio-only and an offer is still made with taps", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await setLanguage(page, baseURL!, "en");
    await customerOpensChat(page);
    await page.getByTestId("voice-record").click();
    await expect(page.getByTestId("voice-timer")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByTestId("voice-stop").click();
    const note = page.getByTestId("voice-message").first();
    await expect(note).toBeVisible({ timeout: 15_000 });
    await expect(note.locator("audio")).toHaveCount(1);
    await expect(note.getByTestId("voice-transcript")).toHaveCount(0);
    await expect(note).toContainText("Audio only");

    await page.getByTestId("offer-new").click();
    await expect(page.getByTestId("offer-ai-draft")).toHaveCount(0);
    await page.getByTestId("offer-price-custom").fill("1200");
    await page.getByTestId("offer-send").click();
    await expect(page.getByTestId("offer-card")).toHaveCount(1);
    await expect(page.getByTestId("offer-card-price")).toContainText("1,200");
    await expect(page.getByTestId("offer-withdraw")).toBeVisible();
    await page.getByTestId("offer-withdraw").click();
    await expect(page.getByTestId("offer-card")).toHaveAttribute("data-status", "withdrawn");
    await expectAccessible(page);
  });
});
