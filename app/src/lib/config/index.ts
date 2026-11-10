import { z } from "zod";

/**
 * Hosts a payment base URL may point at. Anything else refuses to boot, so a
 * live (real-money) endpoint can never be configured by accident (docs/06 §1).
 * Confirm both against the official integration guides in Phase 7.
 */
export const PAYMENT_SANDBOX_HOSTS = {
  jazzcash: ["sandbox.jazzcash.com.pk"],
  easypaisa: ["easypaystg.easypaisa.com.pk"],
} as const;

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-do-not-use-in-production";

// Empty strings in .env files mean "not set".
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const optionalUrl = optionalString.pipe(z.url().optional());

const intWithDefault = (fallback: number, min: number, max: number) =>
  optionalString
    .pipe(z.coerce.number<string | undefined>().int().min(min).max(max).optional())
    .transform((v) => v ?? fallback);

const enumWithDefault = <const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) => optionalString.pipe(z.enum(values).optional()).transform((v) => v ?? fallback);

const envSchema = z.object({
  NODE_ENV: enumWithDefault(["development", "test", "production"], "development"),
  DATABASE_URL: optionalString,
  SESSION_SECRET: optionalString,
  APP_URL: optionalUrl.transform((v) => v ?? "http://localhost:3000"),

  AUTH_MODE: enumWithDefault(["full", "mock"], "mock"),
  // Test-only escape hatch so E2E runs don't trip per-IP limits; refused in production.
  AUTH_RATE_LIMIT: enumWithDefault(["on", "off"], "on"),
  // Marks the local E2E server (DECISIONS.md D-42/D-43). Never set on a deployment.
  RR_E2E: enumWithDefault(["0", "1"], "0"),
  VERCEL: optionalString,
  MOCK_OTP_CODE: optionalString
    .pipe(
      z
        .string()
        .regex(/^\d{6}$/, "MOCK_OTP_CODE must be 6 digits")
        .optional(),
    )
    .transform((v) => v ?? "123456"),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GMAIL_USER: optionalString,
  GMAIL_APP_PASSWORD: optionalString,
  EMAIL_FROM_NAME: optionalString.transform((v) => v ?? "Roshan Rozgar"),

  AI_MODE: enumWithDefault(["live", "fixtures", "off"], "off"),
  GEMINI_API_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  AI_TIMEOUT_MS: intWithDefault(8000, 500, 60000),

  // No default fallback for an invalid value: a typo here must crash, not silently pick a mode.
  PAYMENTS_MODE: optionalString
    .pipe(z.enum(["off", "mock", "sandbox"]).optional())
    .transform((v) => v ?? "off"),
  PAYMENTS_PROVIDERS: optionalString.transform((v) =>
    z.array(z.enum(["jazzcash", "easypaisa", "cash"])).parse(
      (v ?? "jazzcash,easypaisa,cash")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ),
  JAZZCASH_MERCHANT_ID: optionalString,
  JAZZCASH_PASSWORD: optionalString,
  JAZZCASH_INTEGRITY_SALT: optionalString,
  JAZZCASH_BASE_URL: optionalUrl,
  JAZZCASH_CHECKOUT_PATH: optionalString,
  JAZZCASH_INQUIRY_PATH: optionalString,
  EASYPAISA_MODE: optionalString
    .pipe(z.enum(["mock", "sandbox"]).optional())
    .transform((v) => v ?? "mock"),
  EASYPAISA_STORE_ID: optionalString,
  EASYPAISA_HASH_KEY: optionalString,
  EASYPAISA_BASE_URL: optionalUrl,

  DEFAULT_CITY: optionalString.transform((v) => v ?? "islamabad"),
  SEARCH_RADIUS_KM: intWithDefault(10, 1, 50),
  OFFER_TTL_HOURS: intWithDefault(24, 1, 168),
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid configuration: ${message}`);
    this.name = "ConfigError";
  }
}

function assertSandboxUrl(name: string, url: string | undefined, hosts: readonly string[]) {
  if (!url) return;
  const { protocol, hostname } = new URL(url);
  if (protocol !== "https:" || !hosts.includes(hostname)) {
    throw new ConfigError(
      `${name} must be an https URL on the sandbox allow-list (${hosts.join(", ")})`,
    );
  }
}

export function loadConfig(env: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === "production";

  if (isProduction && !e.SESSION_SECRET) {
    throw new ConfigError("SESSION_SECRET is required in production");
  }
  const isE2E = e.RR_E2E === "1";
  if (isE2E && e.VERCEL) {
    throw new ConfigError("RR_E2E must never be set on a deployment");
  }
  if (isProduction && e.AUTH_RATE_LIMIT === "off" && !isE2E) {
    throw new ConfigError("AUTH_RATE_LIMIT=off is not allowed in production");
  }
  if (e.SESSION_SECRET && e.SESSION_SECRET.length < 32) {
    throw new ConfigError("SESSION_SECRET must be at least 32 characters");
  }

  // Checked whenever set, not only in sandbox mode, so a live URL can't sit waiting in the env.
  assertSandboxUrl("JAZZCASH_BASE_URL", e.JAZZCASH_BASE_URL, PAYMENT_SANDBOX_HOSTS.jazzcash);
  assertSandboxUrl("EASYPAISA_BASE_URL", e.EASYPAISA_BASE_URL, PAYMENT_SANDBOX_HOSTS.easypaisa);

  const authFull = e.AUTH_MODE === "full";

  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    isE2E,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    appUrl: e.APP_URL,
    auth: {
      mode: e.AUTH_MODE,
      rateLimit: e.AUTH_RATE_LIMIT === "on" && e.NODE_ENV !== "test",
      mockOtpCode: e.MOCK_OTP_CODE,
      googleEnabled: authFull && !!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET,
      emailOtpEnabled: authFull && !!e.GMAIL_USER && !!e.GMAIL_APP_PASSWORD,
      google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET },
      gmail: { user: e.GMAIL_USER, appPassword: e.GMAIL_APP_PASSWORD, fromName: e.EMAIL_FROM_NAME },
    },
    ai: {
      mode: e.AI_MODE,
      geminiApiKey: e.GEMINI_API_KEY,
      groqApiKey: e.GROQ_API_KEY,
      timeoutMs: e.AI_TIMEOUT_MS,
    },
    payments: {
      mode: e.PAYMENTS_MODE,
      providers: e.PAYMENTS_PROVIDERS,
      jazzcash: {
        merchantId: e.JAZZCASH_MERCHANT_ID,
        password: e.JAZZCASH_PASSWORD,
        integritySalt: e.JAZZCASH_INTEGRITY_SALT,
        baseUrl: e.JAZZCASH_BASE_URL,
        checkoutPath: e.JAZZCASH_CHECKOUT_PATH,
        inquiryPath: e.JAZZCASH_INQUIRY_PATH,
      },
      easypaisa: {
        mode: e.EASYPAISA_MODE,
        storeId: e.EASYPAISA_STORE_ID,
        hashKey: e.EASYPAISA_HASH_KEY,
        baseUrl: e.EASYPAISA_BASE_URL,
      },
    },
    product: {
      defaultCity: e.DEFAULT_CITY,
      searchRadiusKm: e.SEARCH_RADIUS_KM,
      offerTtlHours: e.OFFER_TTL_HOURS,
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

let cached: AppConfig | undefined;

/** Server-only config, validated once on first use. */
export function getConfig(): AppConfig {
  cached ??= loadConfig(process.env);
  return cached;
}
