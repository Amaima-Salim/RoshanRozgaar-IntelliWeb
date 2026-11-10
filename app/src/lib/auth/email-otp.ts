/**
 * Email OTP over Gmail (docs/05 §4, DECISIONS.md D-25, D-47). Built on Better Auth's
 * email-OTP plugin for code storage, attempts and sign-in. The plugin's own send endpoint
 * runs the mailer as a background task and swallows its errors, which would report "sent"
 * for an unsent email, so sending goes through `/email-code/send`, which awaits SMTP.
 * 6 digits, 10 min, 5 attempts, 60 s resend per email, per-IP rate limit.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { z } from "zod";
import { EmailSendError, sendOtpEmail } from "@/lib/email/send";

export const EMAIL_OTP_TTL_SECONDS = 10 * 60;
export const EMAIL_OTP_RESEND_SECONDS = 60;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
/** Fixed code used only by the local E2E server (RR_E2E=1), where nothing is emailed. */
export const E2E_EMAIL_CODE = "424242";

const SEND_PATH = "/email-code/send";
const VERIFY_PATH = "/sign-in/email-otp";
const PLACEHOLDER_DOMAIN = "@phone.invalid";
const identifierFor = (email: string) => `sign-in-otp-${email}`;

function fail(
  status: "BAD_REQUEST" | "TOO_MANY_REQUESTS" | "BAD_GATEWAY",
  code: string,
  extra?: Record<string, unknown>,
) {
  return new APIError(status, { code, message: code, ...extra });
}

export function emailOtpPlugin(options: { stub: boolean }) {
  const otp = emailOTP({
    otpLength: 6,
    expiresIn: EMAIL_OTP_TTL_SECONDS,
    allowedAttempts: EMAIL_OTP_MAX_ATTEMPTS,
    storeOTP: options.stub ? "plain" : "hashed",
    ...(options.stub ? { generateOTP: () => E2E_EMAIL_CODE } : {}),
    // Never reached: the plugin's public send endpoint is closed below.
    async sendVerificationOTP() {
      throw fail("BAD_GATEWAY", "EMAIL_SEND_FAILED");
    },
  });

  const sendCode = createAuthEndpoint(
    SEND_PATH,
    { method: "POST", body: z.strictObject({ email: z.string().max(254).pipe(z.email()) }) },
    async (ctx) => {
      const email = ctx.body.email.trim().toLowerCase();
      // Placeholder phone emails are never mailed (docs/05 §6).
      if (email.endsWith(PLACEHOLDER_DOMAIN)) throw fail("BAD_REQUEST", "INVALID_EMAIL");

      const identifier = identifierFor(email);
      const existing = await ctx.context.internalAdapter.findVerificationValue(identifier);
      if (existing) {
        const age = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
        if (age < EMAIL_OTP_RESEND_SECONDS) {
          throw fail("TOO_MANY_REQUESTS", "RESEND_TOO_SOON", {
            retryAfter: Math.ceil(EMAIL_OTP_RESEND_SECONDS - age),
          });
        }
      }

      const code = await otp.endpoints.createVerificationOTP({
        context: ctx.context,
        body: { email, type: "sign-in" },
      });
      try {
        await sendOtpEmail(email, code, EMAIL_OTP_TTL_SECONDS / 60);
      } catch (err) {
        // Drop the undelivered code so the resend cooldown doesn't block an immediate retry.
        await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
        if (err instanceof EmailSendError) throw fail("BAD_GATEWAY", "EMAIL_SEND_FAILED");
        throw err;
      }
      // Reached only after SMTP accepted the message.
      return ctx.json({ sent: true, expiresIn: EMAIL_OTP_TTL_SECONDS });
    },
  );

  return {
    ...otp,
    endpoints: { ...otp.endpoints, emailCodeSend: sendCode },
    hooks: {
      ...otp.hooks,
      // Only sign-in is exposed from the plugin; every other `/email-otp/*` route is closed.
      before: [
        {
          matcher: (ctx: { path?: string }) => !!ctx.path?.startsWith("/email-otp/"),
          handler: createAuthMiddleware(async () => {
            throw new APIError("NOT_FOUND", { message: "NOT_FOUND" });
          }),
        },
      ],
    },
    rateLimit: [
      { pathMatcher: (path: string) => path === SEND_PATH, window: 60, max: 5 },
      { pathMatcher: (path: string) => path === VERIFY_PATH, window: 60, max: 15 },
    ],
  } satisfies BetterAuthPlugin;
}
