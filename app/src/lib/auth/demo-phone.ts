/**
 * Demo phone login (D-12, docs/05 §3, DECISIONS.md D-31).
 *
 * A Better Auth plugin with two endpoints. No SMS is ever sent: the code is the
 * fixed MOCK_OTP_CODE, and the UI says so. Everything else behaves like a real
 * OTP flow so the rest of the app sees an ordinary Better Auth session.
 */
import { timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

export const DEMO_OTP_TTL_SECONDS = 5 * 60;
export const DEMO_OTP_RESEND_SECONDS = 60;
export const DEMO_OTP_MAX_ATTEMPTS = 5;

/** Pakistani mobile numbers: 03XXXXXXXXX. Accepts spaces, dashes and a +92 prefix. */
export function normalizePkPhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  const local = digits.startsWith("+92")
    ? `0${digits.slice(3)}`
    : digits.startsWith("92")
      ? `0${digits.slice(2)}`
      : digits;
  return /^03\d{9}$/.test(local) ? local : null;
}

const phoneSchema = z
  .string()
  .max(20)
  .transform((v, ctx) => {
    const phone = normalizePkPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "INVALID_PHONE" });
      return z.NEVER;
    }
    return phone;
  });

const identifierFor = (phone: string) => `demo-phone-otp:${phone}`;

function codesMatch(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function fail(
  status: "BAD_REQUEST" | "FORBIDDEN" | "TOO_MANY_REQUESTS",
  code: string,
  extra?: Record<string, unknown>,
) {
  return new APIError(status, { code, message: code, ...extra });
}

export function demoPhone(options: { code: string }) {
  return {
    id: "demo-phone",
    endpoints: {
      demoPhoneSend: createAuthEndpoint(
        "/demo-phone/send",
        { method: "POST", body: z.strictObject({ phone: phoneSchema }) },
        async (ctx) => {
          const { phone } = ctx.body;
          const identifier = identifierFor(phone);
          const existing = await ctx.context.internalAdapter.findVerificationValue(identifier);
          if (existing) {
            const ageSeconds = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
            if (ageSeconds < DEMO_OTP_RESEND_SECONDS) {
              throw fail("TOO_MANY_REQUESTS", "RESEND_TOO_SOON", {
                retryAfter: Math.ceil(DEMO_OTP_RESEND_SECONDS - ageSeconds),
              });
            }
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
          }
          // The value holds only the attempt count; the code itself is the fixed demo code.
          await ctx.context.internalAdapter.createVerificationValue({
            identifier,
            value: "0",
            expiresAt: new Date(Date.now() + DEMO_OTP_TTL_SECONDS * 1000),
          });
          return ctx.json({ sent: false, demo: true, expiresIn: DEMO_OTP_TTL_SECONDS });
        },
      ),

      demoPhoneVerify: createAuthEndpoint(
        "/demo-phone/verify",
        {
          method: "POST",
          body: z.strictObject({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }),
        },
        async (ctx) => {
          const { phone, code } = ctx.body;
          const identifier = identifierFor(phone);
          const challenge = await ctx.context.internalAdapter.findVerificationValue(identifier);
          if (!challenge) throw fail("BAD_REQUEST", "OTP_NOT_FOUND");
          if (new Date(challenge.expiresAt).getTime() < Date.now()) {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
            throw fail("BAD_REQUEST", "OTP_EXPIRED");
          }
          const attempts = Number.parseInt(challenge.value, 10) || 0;
          if (attempts >= DEMO_OTP_MAX_ATTEMPTS) {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
            throw fail("FORBIDDEN", "TOO_MANY_ATTEMPTS");
          }
          if (!codesMatch(code, options.code)) {
            const used = attempts + 1;
            if (used >= DEMO_OTP_MAX_ATTEMPTS) {
              await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
              throw fail("FORBIDDEN", "TOO_MANY_ATTEMPTS");
            }
            await ctx.context.internalAdapter.updateVerificationByIdentifier(identifier, {
              value: String(used),
            });
            throw fail("BAD_REQUEST", "INVALID_OTP", {
              attemptsLeft: DEMO_OTP_MAX_ATTEMPTS - used,
            });
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);

          type DemoUser = { id: string; email: string; role?: string | null };
          let user = await ctx.context.adapter.findOne<DemoUser>({
            model: "user",
            where: [{ field: "phone", value: phone }],
          });
          if (!user) {
            const created = await ctx.context.internalAdapter.createUser(
              {
                name: phone,
                // Placeholder, replaced with `<id>@phone.invalid` right after (docs/02 §3). Never mailed, never linked.
                email: `pending-${phone}@phone.invalid`,
                emailVerified: false,
                phone,
              },
              { method: "phone-number" },
            );
            user = (await ctx.context.internalAdapter.updateUser(created.id, {
              email: `${created.id}@phone.invalid`,
            })) as DemoUser;
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "SESSION_FAILED" });
          await setSessionCookie(ctx, {
            session,
            user: user as Parameters<typeof setSessionCookie>[1]["user"],
          });
          return ctx.json({ ok: true, userId: user.id, role: user.role ?? null });
        },
      ),
    },
    rateLimit: [
      // Per-IP backstop on top of the per-phone rules above (docs/05 §3, docs/07 §3).
      { pathMatcher: (path) => path === "/demo-phone/send", window: 60, max: 5 },
      { pathMatcher: (path) => path === "/demo-phone/verify", window: 60, max: 15 },
    ],
  } satisfies BetterAuthPlugin;
}
