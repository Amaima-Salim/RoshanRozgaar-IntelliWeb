/** Uses synthetic/app content only. SMTP verification authenticates but never sends an email. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { loadEnvFiles } from "../src/lib/db/load-env";
import { getConfig } from "../src/lib/config";
import { draftRequest, extractWorkerProfile, transcribe } from "../src/lib/ai";
import { translateText } from "../src/lib/ai/chat";
import { draftReview, phraseTrustSummary } from "../src/lib/ai/trust";
import { ocrCnic } from "../src/lib/ai/ocr";
import { emptyRates } from "../src/lib/domain/trust";

async function main() {
  loadEnvFiles();
  const config = getConfig();
  const only = process.argv[2];
  if (only && !["ai", "smtp"].includes(only)) throw new Error("Use: services:check [ai|smtp]");
  let failures = 0;
  async function check(label: string, run: () => Promise<void>) {
    try {
      await run();
      console.log(`PASS ${label}`);
    } catch (error) {
      failures++;
      // Never print SDK/SMTP errors, response bodies, credentials, recipient addresses or draft text.
      const reason =
        error && typeof error === "object" && "reason" in error
          ? String(error.reason)
          : "check failed";
      console.error(`FAIL ${label}: ${reason}`);
    }
  }

  if (!only || only === "ai") {
    if (config.ai.mode !== "live")
      throw new Error("Set AI_MODE=live before running AI service checks.");
    await check("Groq request drafting", async () => {
      const result = await draftRequest({
        text: "The bathroom basin drains very slowly and water pools inside.",
      });
      assert.equal(result.source, "llm");
      assert.equal(result.draft.trade, "plumber");
      assert.equal(result.simulated, false);
    });
    await check("Groq profile extraction", async () => {
      const result = await extractWorkerProfile({
        stepId: "trade",
        transcript: "I restore broken bathroom fixtures and unblock drains.",
        allowedAreas: [],
      });
      assert.equal(result.source, "llm");
      assert.equal(result.draft.trade, "plumber");
    });
    await check("Groq Urdu to English translation", async () => {
      const result = await translateText({ text: "میں کل صبح آؤں گا۔", from: "ur", to: "en" });
      assert.match(result.translation, /tomorrow/i);
      assert.equal(result.simulated, false);
    });
    await check("Groq review drafting", async () => {
      const result = await draftReview("Arrived on time and completed the work neatly.");
      assert.equal(result.draft.sentiment, "positive");
      assert.equal(result.simulated, false);
    });
    await check("Groq grounded reputation summary", async () => {
      const result = await phraseTrustSummary(
        {
          reviewCount: 4,
          avgStars: 4.5,
          jobsCompleted: 4,
          repeatCustomers: 0,
          rates: emptyRates(),
        },
        [],
      );
      assert.ok(result);
      assert.equal(result.simulated, false);
    });
    for (const language of ["en", "ur"]) {
      await check(`Groq Whisper on prerecorded ${language} app prompt`, async () => {
        const bytes = await readFile(`public/audio/${language}/onboarding.trade.mp3`);
        const result = await transcribe({ bytes, mime: "audio/mpeg" }, { stepId: "trade" });
        assert.ok(result.transcript.text.trim());
        assert.equal(result.transcript.language, language);
        assert.equal(result.simulated, false);
      });
    }
    await check("Groq vision rejects app icon as a CNIC", async () => {
      const bytes = await readFile("public/icons/icon-192.png");
      const result = await ocrCnic([{ bytes, mime: "image/png" }]);
      assert.equal(result.draft.cnicNumber, null);
      assert.equal(result.draft.fullName, null);
      assert.equal(result.simulated, false);
    });
  }
  if (!only || only === "smtp") {
    await check("Gmail OTP SMTP authentication (no email sent)", async () => {
      assert.equal(config.auth.emailOtpEnabled, true);
      assert.equal(config.auth.emailOtpStub, false);
      assert.ok(config.auth.gmail.user);
      assert.ok(config.auth.gmail.appPassword);
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: { user: config.auth.gmail.user, pass: config.auth.gmail.appPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });
      try {
        await transport.verify();
      } finally {
        transport.close();
      }
    });
  }
  if (failures) process.exitCode = 1;
}
void main().catch(() => {
  console.error("FAIL service check configuration; verify environment and selected mode.");
  process.exitCode = 1;
});
