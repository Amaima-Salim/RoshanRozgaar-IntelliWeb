import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { demoPhone } from "./demo-phone";

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: "Roshan Rozgar",
    baseURL: config.appUrl,
    secret: config.sessionSecret,
    trustedOrigins: [config.appUrl],
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        rateLimits: schema.rateLimits,
      },
    }),
    advanced: { database: { generateId: "uuid" } },
    user: {
      additionalFields: {
        // `input: false`: clients can never set these through Better Auth endpoints (docs/05 §2).
        role: { type: "string", required: false, input: false },
        phone: { type: "string", required: false, input: false, unique: true },
        nameUr: { type: "string", required: false, input: false },
        language: { type: "string", required: false, input: false, defaultValue: "ur" },
        isSeeded: {
          type: "boolean",
          required: false,
          input: false,
          defaultValue: false,
          returned: false,
        },
      },
    },
    emailAndPassword: { enabled: false },
    rateLimit: {
      // On in every environment (Better Auth defaults to production only), stored in the DB so
      // limits hold across serverless instances.
      enabled: config.auth.rateLimit,
      storage: "database",
    },
    plugins: [demoPhone({ code: config.auth.mockOtpCode }), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __rrAuth?: Auth };

/** Built on first use so importing this module needs no env at build time. */
export function getAuth(): Auth {
  globalForAuth.__rrAuth ??= createAuth();
  return globalForAuth.__rrAuth;
}
