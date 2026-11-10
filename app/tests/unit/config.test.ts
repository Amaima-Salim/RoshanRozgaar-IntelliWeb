import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "@/lib/config";

const SECRET = "x".repeat(40);

describe("loadConfig", () => {
  it("boots in development with nothing set and safe defaults", () => {
    const c = loadConfig({});
    expect(c.auth.mode).toBe("mock");
    expect(c.ai.mode).toBe("off");
    expect(c.payments.mode).toBe("off");
    expect(c.auth.mockOtpCode).toBe("123456");
    expect(c.product.searchRadiusKm).toBe(10);
  });

  it("crashes in production without SESSION_SECRET", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: "production", SESSION_SECRET: SECRET })).not.toThrow();
  });

  it("derives APP_URL: explicit value wins, then the Vercel domain, then localhost", () => {
    expect(loadConfig({}).appUrl).toBe("http://localhost:3000");
    expect(loadConfig({ APP_URL: "https://rr.example.com/" }).appUrl).toBe(
      "https://rr.example.com",
    );
    expect(loadConfig({ VERCEL_PROJECT_PRODUCTION_URL: "rr.vercel.app" }).appUrl).toBe(
      "https://rr.vercel.app",
    );
    expect(
      loadConfig({
        APP_URL: "https://rr.example.com",
        VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app",
      }).appUrl,
    ).toBe("https://rr.example.com");
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(() => loadConfig({ SESSION_SECRET: "short" })).toThrow(/32 characters/);
  });

  it("crashes on an invalid PAYMENTS_MODE (never silently picks one)", () => {
    expect(() => loadConfig({ PAYMENTS_MODE: "live" })).toThrow(ConfigError);
  });

  it("crashes when a payment base URL is not on the sandbox allow-list", () => {
    expect(() => loadConfig({ JAZZCASH_BASE_URL: "https://payments.jazzcash.com.pk" })).toThrow(
      /sandbox/,
    );
    expect(() => loadConfig({ JAZZCASH_BASE_URL: "http://sandbox.jazzcash.com.pk" })).toThrow(
      /https/,
    );
    expect(() => loadConfig({ EASYPAISA_BASE_URL: "https://easypay.easypaisa.com.pk" })).toThrow(
      /sandbox/,
    );
    expect(() =>
      loadConfig({ JAZZCASH_BASE_URL: "https://sandbox.jazzcash.com.pk" }),
    ).not.toThrow();
  });

  it("degrades gracefully when Google/Gmail values are missing", () => {
    const c = loadConfig({ AUTH_MODE: "full", NODE_ENV: "test" });
    expect(c.auth.googleEnabled).toBe(false);
    expect(c.auth.emailOtpEnabled).toBe(false);
  });

  it("offers email codes in development without Gmail values (console fallback), not in production", () => {
    expect(loadConfig({ AUTH_MODE: "full", NODE_ENV: "development" }).auth.emailOtpEnabled).toBe(
      true,
    );
    const prod = loadConfig({
      AUTH_MODE: "full",
      NODE_ENV: "production",
      SESSION_SECRET: "x".repeat(32),
    });
    expect(prod.auth.emailOtpEnabled).toBe(false);
  });

  it("keeps Google/email off in mock mode even when values exist", () => {
    const c = loadConfig({
      AUTH_MODE: "mock",
      GOOGLE_CLIENT_ID: "a",
      GOOGLE_CLIENT_SECRET: "b",
      GMAIL_USER: "c",
      GMAIL_APP_PASSWORD: "d",
    });
    expect(c.auth.googleEnabled).toBe(false);
    expect(c.auth.emailOtpEnabled).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const c = loadConfig({ GEMINI_API_KEY: "", SEARCH_RADIUS_KM: "" });
    expect(c.ai.geminiApiKey).toBeUndefined();
    expect(c.product.searchRadiusKm).toBe(10);
  });

  it("refuses to switch auth rate limits off in production", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", SESSION_SECRET: SECRET, AUTH_RATE_LIMIT: "off" }),
    ).toThrow(ConfigError);
    expect(loadConfig({ AUTH_RATE_LIMIT: "off" }).auth.rateLimit).toBe(false);
    // Allowed only for the local E2E production build, and never on Vercel.
    expect(
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: SECRET,
        AUTH_RATE_LIMIT: "off",
        RR_E2E: "1",
      }).auth.rateLimit,
    ).toBe(false);
    expect(() => loadConfig({ RR_E2E: "1", VERCEL: "1" })).toThrow(/deployment/);
    expect(loadConfig({}).auth.rateLimit).toBe(true);
  });

  it("rejects a non-6-digit MOCK_OTP_CODE", () => {
    expect(() => loadConfig({ MOCK_OTP_CODE: "12ab" })).toThrow(ConfigError);
  });
});
