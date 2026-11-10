import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/server";
import { db, getSqlClient } from "@/lib/db/client";
import { users, verifications } from "@/lib/db/schema";

const BASE = "http://localhost:3100/api/auth";

async function post(
  path: string,
  body: unknown,
  cookie?: string,
  origin = "http://localhost:3100",
) {
  const res = await getAuth().handler(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie && { cookie }),
      },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const setCookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, json, cookie: setCookie };
}

let n = 0;
const freshPhone = () => `0399${String(Date.now() % 1_000_000).padStart(6, "0")}${n++ % 10}`;

beforeEach(async () => {
  await db.delete(verifications);
});

afterAll(async () => {
  await getSqlClient().end();
});

describe("demo phone login (docs/05 §3)", () => {
  it("signs in a new phone with the fixed code: placeholder email, no role yet", async () => {
    const phone = freshPhone();
    expect((await post("/demo-phone/send", { phone })).status).toBe(200);
    const res = await post("/demo-phone/verify", { phone, code: "123456" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, role: null });
    expect(res.cookie).toMatch(/session_token=/);

    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    expect(user?.email).toBe(`${user?.id}@phone.invalid`);
    expect(user?.emailVerified).toBe(false);
    expect(user?.role).toBeNull();
  });

  it("returns the same user on a second sign-in", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    const first = await post("/demo-phone/verify", { phone, code: "123456" });
    await db.delete(verifications);
    await post("/demo-phone/send", { phone });
    const second = await post("/demo-phone/verify", { phone, code: "123456" });
    expect(second.json?.userId).toBe(first.json?.userId);
  });

  it("rejects a wrong code and counts attempts", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    const res = await post("/demo-phone/verify", { phone, code: "000000" });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: "INVALID_OTP", attemptsLeft: 4 });
  });

  it("locks the challenge after 5 wrong attempts, even if the right code follows", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    for (let i = 0; i < 4; i++) await post("/demo-phone/verify", { phone, code: "000000" });
    const fifth = await post("/demo-phone/verify", { phone, code: "000000" });
    expect(fifth.json?.code).toBe("TOO_MANY_ATTEMPTS");
    const right = await post("/demo-phone/verify", { phone, code: "123456" });
    expect(right.status).toBe(400);
    expect(right.json?.code).toBe("OTP_NOT_FOUND");
  });

  it("requires a code to have been requested", async () => {
    const res = await post("/demo-phone/verify", { phone: freshPhone(), code: "123456" });
    expect(res.json?.code).toBe("OTP_NOT_FOUND");
  });

  it("rejects an expired challenge", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verifications.identifier, `demo-phone-otp:${phone}`));
    const res = await post("/demo-phone/verify", { phone, code: "123456" });
    expect(res.status).toBe(400);
    expect(["OTP_EXPIRED", "OTP_NOT_FOUND"]).toContain(res.json?.code);
  });

  it("throttles re-sends to one per 60 s per phone", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    const again = await post("/demo-phone/send", { phone });
    expect(again.status).toBe(429);
    expect(again.json?.code).toBe("RESEND_TOO_SOON");
  });

  it("does not allow reusing a consumed code", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    expect((await post("/demo-phone/verify", { phone, code: "123456" })).status).toBe(200);
    const reuse = await post("/demo-phone/verify", { phone, code: "123456" });
    expect(reuse.json?.code).toBe("OTP_NOT_FOUND");
  });

  it("rejects non-Pakistani-mobile numbers and unknown body fields", async () => {
    expect((await post("/demo-phone/send", { phone: "12345" })).status).toBe(400);
    expect((await post("/demo-phone/send", { phone: freshPhone(), role: "worker" })).status).toBe(
      400,
    );
  });
});

describe("role can't be set by the client (docs/05 §2)", () => {
  it("update-user refuses `role`, and the DB is unchanged", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    const login = await post("/demo-phone/verify", { phone, code: "123456" });
    const res = await post("/update-user", { role: "worker" }, login.cookie);
    expect(res.status).toBe(400);
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    expect(user?.role).toBeNull();
  });

  it("verify can't smuggle a role in either", async () => {
    const phone = freshPhone();
    await post("/demo-phone/send", { phone });
    const res = await post("/demo-phone/verify", { phone, code: "123456", role: "customer" });
    expect(res.status).toBe(400);
  });
});

describe("trusted origins (regression: sign-in dead on 127.0.0.1 / LAN)", () => {
  // Better Auth skips its origin check under NODE_ENV=test, so assert the list it enforces.
  it("trusts loopback and LAN origins on the app port, and nothing foreign", async () => {
    const { trustedOrigins } = await getAuth().$context;
    expect(trustedOrigins).toContain("http://localhost:3100");
    expect(trustedOrigins).toContain("http://127.0.0.1:3100");
    expect(trustedOrigins).toContain("http://192.168.*.*:3100");
    expect(trustedOrigins.some((o) => o.includes("evil"))).toBe(false);
  });
});
