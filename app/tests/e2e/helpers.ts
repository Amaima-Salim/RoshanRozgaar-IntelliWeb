import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

export async function setLanguage(page: Page, baseURL: string, lang: "ur" | "en") {
  await page.context().addCookies([{ name: "rr_lang", value: lang, url: baseURL }]);
}

/** Navigate and wait until React has hydrated, so clicks hit live handlers. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached", timeout: 60_000 });
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, "no horizontal scroll").toBeLessThanOrEqual(innerWidth);
}

/** Zero serious/critical axe violations (docs/03 §7). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
}

export async function signInWithDemoAccount(
  page: Page,
  role: "worker" | "customer",
  phone: string,
) {
  await open(page, `/login?role=${role}`);
  await page.getByTestId(`demo-${phone}`).click();
}
