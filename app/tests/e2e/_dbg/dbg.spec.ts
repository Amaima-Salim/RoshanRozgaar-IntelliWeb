import { test } from "@playwright/test";
import { setLanguage, signInWithDemoAccount } from "../helpers";
import { resetDemoWorker } from "../db";
test("dbg", async ({ page, baseURL }) => {
  resetDemoWorker();
  page.on("response", async (r) => { if (r.url().includes("/api/ai")) console.log("resp", r.url().split("/api/")[1], r.status(), (await r.text()).slice(0, 160)); });
  page.on("request", (r) => { if (r.url().includes("/api/ai/transcribe")) console.log("req transcribe", r.postDataBuffer()?.length); });
  await setLanguage(page, baseURL!, "en");
  await signInWithDemoAccount(page, "worker", "03000000010");
  await page.waitForURL(/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Tap to speak/ }).click();
  await page.getByTestId("consent-accept").click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Listening/ }).click();
  await page.waitForTimeout(3000);
  console.log("voicebox:", JSON.stringify(await page.getByTestId("voice-box").innerText()));
});
