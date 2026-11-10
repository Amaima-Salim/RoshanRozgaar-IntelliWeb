import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Config reads env on first use: switch on full auth with (fake) Gmail values. Nothing is
// ever sent: the email module is replaced below.
vi.hoisted(() => {
  process.env.AUTH_MODE = "full";
  process.env.GMAIL_USER = "project@example.test";
  process.env.GMAIL_APP_PASSWORD = "xxxxxxxxxxxxxxxx";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
});

const mail = vi.hoisted(() => ({ sent: [] as { to: string; code: string }[], fail: false }));
vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendOtpEmail: async (to: string, code: string) => {
      if (mail.fail) throw new actual.EmailSendError();
      mail.sent.push({ to, code });
    },
  };
});

import { getAuth } from "@/lib/auth/server";
import { db, getSqlClient } from "@/lib/db/client";
import { accounts, users, verifications } from "@/lib/db/schema";

const BASE = "http://localhost:3100/api/auth";
async function post(path: string, body: unknown) {
  const res = await getAuth().handler(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3100" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json, cookie: res.headers.getSetCookie().join(";") };
}
const send = (email: string) => post("/email-code/send", { email });
const signIn = (email: string, otp: string) => post("/sign-in/email-otp", { email, otp });

let n = 0;
const freshEmail = () => `person${Date.now()}${n++}@example.test`;
const lastCode = () => mail.sent.at(-1)!.code;

beforeEach(async () => {
  await db.delete(verifications);
  mail.sent.length = 0;
  mail.fail = false;
});
afterAll(async () => {
  await getSqlClient().end();
});

describe("email OTP sign-in (docs/05 §4)", () => {
  it("emails a 6-digit code, then signs in a new user with a verified email and no role", async () => {
    const email = freshEmail();
    expect((await send(email)).status).toBe(200);
    expect(lastCode()).toMatch(/^\d{6}$/);
    const res = await signIn(email, lastCode());
    expect(res.status).toBe(200);
    expect(res.cookie).toMatch(/session_token=/);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.emailVerified).toBe(true);
    expect(user?.role).toBeNull();
  });

  it("rejects a wrong code and never stores the code in plain text", async () => {
    const email = freshEmail();
    await send(email);
    const [stored] = await db.select().from(verifications);
    expect(stored?.value).not.toContain(lastCode());
    const res = await signIn(email, lastCode() === "000000" ? "111111" : "000000");
    expect(res.status).toBe(400);
    expect(res.json?.code).toBe("INVALID_OTP");
  });

  it("locks out after 5 wrong codes, even for the right one", async () => {
    const email = freshEmail();
    await send(email);
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await signIn(email, wrong)).status).toBe(400);
    const locked = await signIn(email, right);
    expect(locked.status).toBe(403);
    expect(locked.json?.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("rejects an expired code", async () => {
    const email = freshEmail();
    await send(email);
    await db.update(verifications).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await signIn(email, lastCode());
    expect(res.status).toBe(400);
    expect(["OTP_EXPIRED", "INVALID_OTP"]).toContain(res.json?.code);
  });

  it("rejects reusing a consumed code", async () => {
    const email = freshEmail();
    await send(email);
    const code = lastCode();
    expect((await signIn(email, code)).status).toBe(200);
    expect((await signIn(email, code)).status).toBe(400);
  });

  it("throttles resends to one per 60 s per email", async () => {
    const email = freshEmail();
    expect((await send(email)).status).toBe(200);
    const again = await send(email);
    expect(again.status).toBe(429);
    expect(again.json?.code).toBe("RESEND_TOO_SOON");
    expect(mail.sent).toHaveLength(1);
  });

  it("reports EMAIL_SEND_FAILED when SMTP fails, and a retry is not throttled", async () => {
    const email = freshEmail();
    mail.fail = true;
    const res = await send(email);
    expect(res.status).toBe(502);
    expect(res.json?.code).toBe("EMAIL_SEND_FAILED");
    expect(res.json).not.toHaveProperty("sent");
    expect(mail.sent).toHaveLength(0);
    mail.fail = false;
    expect((await send(email)).status).toBe(200);
  });

  it("never mails placeholder phone addresses", async () => {
    expect((await send("abc@phone.invalid")).status).toBe(400);
    expect(mail.sent).toHaveLength(0);
  });

  it("closes the plugin's own endpoints, including its swallow-errors send", async () => {
    for (const path of ["/email-otp/verify-email", "/email-otp/send-verification-otp"]) {
      const res = await post(path, { email: freshEmail(), otp: "123456", type: "sign-in" });
      expect(res.status).toBe(404);
    }
    expect(mail.sent).toHaveLength(0);
  });
});

describe("account linking (docs/05 §6)", () => {
  it("the same verified email signs in to the existing (e.g. Google) user, not a new one", async () => {
    const email = freshEmail();
    const [google] = await db
      .insert(users)
      .values({ name: "G User", email, emailVerified: true })
      .returning();
    await db
      .insert(accounts)
      .values({ accountId: "g-123", providerId: "google", userId: google!.id });
    await send(email);
    const res = await signIn(email, lastCode());
    expect(res.status).toBe(200);
    expect((res.json?.user as { id: string }).id).toBe(google!.id);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
  });

  it("an unverified-email user is never silently signed in as; a phone-only user is untouched", async () => {
    const email = freshEmail();
    const [phoneUser] = await db
      .insert(users)
      .values({
        name: "0300",
        email: `${crypto.randomUUID()}@phone.invalid`,
        phone: `0388${Date.now() % 10_000_000}`.slice(0, 11),
      })
      .returning();
    await send(email);
    const res = await signIn(email, lastCode());
    expect((res.json?.user as { id: string }).id).not.toBe(phoneUser!.id);
    const [again] = await db.select().from(users).where(eq(users.id, phoneUser!.id));
    expect(again?.emailVerified).toBe(false);
  });
});
