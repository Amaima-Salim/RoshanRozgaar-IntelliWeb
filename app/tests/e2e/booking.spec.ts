import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  CUSTOMER_1,
  CUSTOMER_2,
  WORKER_PHONE,
  cleanBookingData,
  createPendingOffer,
  jobsForOffers,
  wednesday10,
} from "./booking-db";
import {
  expectAccessible,
  expectNoHorizontalScroll,
  open,
  setLanguage,
  signInWithDemoAccount,
} from "./helpers";

/** A fresh browser context signed in, so two people can act at the same instant. */
async function personContext(
  browser: Browser,
  project: { use: Record<string, unknown> },
  baseURL: string,
  signIn: (page: Page) => Promise<void>,
  lang: "ur" | "en" = "en",
) {
  const context = await browser.newContext({ ...project.use, baseURL });
  const page = await context.newPage();
  await setLanguage(page, baseURL, lang);
  await signIn(page);
  return { context, page };
}

const asCustomer = (phone: string) => async (page: Page) => {
  await signInWithDemoAccount(page, "customer", phone);
  await expect(page).toHaveURL(/\/c\/request\/new$/);
};

const asWorker = (phone: string) => async (page: Page) => {
  await open(page, "/login?role=worker");
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-code").click();
  await page.getByTestId("code-input").fill("123456");
  await page.getByTestId("verify-code").click();
  await expect(page).toHaveURL(/\/w\//);
};

test.describe("booking (O4)", () => {
  test.beforeEach(async () => {
    await cleanBookingData();
  });

  test("two customers accept the same worker at the same time: one books, one is told clearly", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const startAt = wednesday10(testInfo.project.name === "phone" ? 6 : 5);
    const a = await createPendingOffer(CUSTOMER_1, startAt);
    const b = await createPendingOffer(CUSTOMER_2, startAt);
    const project = testInfo.project as unknown as { use: Record<string, unknown> };
    const one = await personContext(browser, project, baseURL!, asCustomer(CUSTOMER_1));
    const two = await personContext(browser, project, baseURL!, asCustomer(CUSTOMER_2));

    await open(one.page, `/c/offer/${a.offerId}`);
    await open(two.page, `/c/offer/${b.offerId}`);
    // The accept screen restates the stored terms and the button carries the amount.
    await expect(one.page.getByTestId("accept-price")).toHaveText("Rs 1,800");
    await expect(one.page.getByTestId("accept-button")).toContainText("Rs 1,800");
    await expect(one.page.getByTestId("accept-panel")).toContainText("do not need to pay");
    await expectNoHorizontalScroll(one.page);
    await expectAccessible(one.page);

    // Both press at the same moment.
    await Promise.all([
      one.page.getByTestId("accept-button").click(),
      two.page.getByTestId("accept-button").click(),
    ]);
    const outcome = (p: Page) =>
      p.locator("[data-testid=accept-success], [data-testid=accept-conflict]").first();
    await expect(outcome(one.page)).toBeVisible({ timeout: 20_000 });
    await expect(outcome(two.page)).toBeVisible({ timeout: 20_000 });

    const results = await Promise.all(
      [one.page, two.page].map(async (p) => ({
        p,
        won: await p.getByTestId("accept-success").isVisible(),
      })),
    );
    expect(results.filter((r) => r.won)).toHaveLength(1);
    const loser = results.find((r) => !r.won)!.p;
    await expect(loser.getByTestId("accept-conflict")).toContainText("booked this worker");
    await expect(loser.getByTestId("accept-conflict")).toContainText("Nothing was confirmed");
    await expectAccessible(loser);
    await expectNoHorizontalScroll(loser);

    const jobs = await jobsForOffers([a.offerId, b.offerId]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("confirmed");

    await one.context.close();
    await two.context.close();
  });

  test("full lifecycle across two sessions: book → start → done → confirm, address only for the worker", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const startAt = wednesday10(testInfo.project.name === "phone" ? 8 : 7);
    const { offerId } = await createPendingOffer(CUSTOMER_1, startAt, 2200);
    const project = testInfo.project as unknown as { use: Record<string, unknown> };
    const customer = await personContext(browser, project, baseURL!, asCustomer(CUSTOMER_1));
    const worker = await personContext(browser, project, baseURL!, asWorker(WORKER_PHONE));

    // Customer books. Success appears only after the server answers, with the stored price.
    await open(customer.page, `/c/offer/${offerId}`);
    await customer.page.getByTestId("accept-button").click();
    await expect(customer.page.getByTestId("accept-success")).toContainText("Rs 2,200");
    await customer.page.getByRole("link", { name: "View the job" }).click();
    await expect(customer.page).toHaveURL(/\/c\/job\/[0-9a-f-]{36}$/);
    const jobId = customer.page.url().split("/").pop()!;
    await expect(customer.page.getByTestId("job")).toHaveAttribute("data-status", "confirmed");
    await expect(customer.page.getByTestId("job-address")).toHaveCount(0); // never shown to the customer's view
    await expectAccessible(customer.page);
    await expectNoHorizontalScroll(customer.page);

    // The worker now sees the exact address and the Start button.
    await open(worker.page, `/w/job/${jobId}`);
    await expect(worker.page.getByTestId("job-address")).toContainText("House 21, Street 5, G-9");
    await expect(worker.page.getByTestId("job-confirm-complete")).toHaveCount(0);
    await expectAccessible(worker.page);
    await worker.page.getByTestId("job-start").click();
    await expect(worker.page.getByTestId("job")).toHaveAttribute("data-status", "in_progress");

    // The customer's page catches up by polling (no reload).
    await expect(customer.page.getByTestId("job")).toHaveAttribute("data-status", "in_progress", {
      timeout: 15_000,
    });

    await worker.page.getByTestId("job-request-complete").click();
    await expect(worker.page.getByTestId("job-waiting-customer")).toBeVisible();
    await expect(customer.page.getByTestId("job-confirm-complete")).toBeVisible({
      timeout: 15_000,
    });
    await customer.page.getByTestId("job-confirm-complete").click();
    await expect(customer.page.getByTestId("job")).toHaveAttribute("data-status", "completed");
    await expect(customer.page.getByTestId("job-timeline").locator("li")).toHaveCount(4);

    await customer.context.close();
    await worker.context.close();
  });

  test("cancelling needs a reason and frees the worker (Urdu, RTL)", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const startAt = wednesday10(testInfo.project.name === "phone" ? 10 : 9);
    const { offerId } = await createPendingOffer(CUSTOMER_1, startAt);
    const project = testInfo.project as unknown as { use: Record<string, unknown> };
    const customer = await personContext(browser, project, baseURL!, asCustomer(CUSTOMER_1), "ur");
    await open(customer.page, `/c/offer/${offerId}`);
    await expect(customer.page.locator("html")).toHaveAttribute("dir", "rtl");
    await customer.page.getByTestId("accept-button").click();
    await expect(customer.page.getByTestId("accept-success")).toBeVisible();
    await customer.page.locator("a[href^='/c/job/']").click();
    await customer.page.getByTestId("job-cancel").click();
    await expect(customer.page.getByTestId("job-cancel-confirm")).toBeDisabled(); // no reason yet
    await customer.page.getByTestId("cancel-reason-plans_changed").click();
    await customer.page.getByTestId("job-cancel-confirm").click();
    await expect(customer.page.getByTestId("job")).toHaveAttribute("data-status", "cancelled");
    await expect(customer.page.getByTestId("job-cancelled-note")).toBeVisible();
    await expectAccessible(customer.page);
    await customer.context.close();
  });

  test("someone else's offer is simply not found (no existence leak)", async ({
    page,
    baseURL,
  }) => {
    await setLanguage(page, baseURL!, "en");
    await asCustomer(CUSTOMER_1)(page);
    const { offerId } = await createPendingOffer(CUSTOMER_2, wednesday10(11));
    const response = await page.goto(`/c/offer/${offerId}`);
    expect(response?.status()).toBe(404);
  });
});
