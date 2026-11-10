import { describe, expect, it } from "vitest";
import { normalizePkPhone } from "@/lib/auth/demo-phone";
import { seedUuid } from "@/lib/db/seed";
import { redact } from "@/lib/log";

describe("normalizePkPhone", () => {
  it.each([
    ["03000000010", "03000000010"],
    ["0300-0000010", "03000000010"],
    ["0300 0000010", "03000000010"],
    ["+923000000010", "03000000010"],
    ["923000000010", "03000000010"],
  ])("%s → %s", (input, expected) => expect(normalizePkPhone(input)).toBe(expected));

  it.each(["", "12345", "0300000001", "040000000100", "0300000001a", "+14155550100"])(
    "rejects %s",
    (input) => {
      expect(normalizePkPhone(input)).toBeNull();
    },
  );
});

describe("redact", () => {
  it("redacts sensitive keys and masks phones/emails inside strings", () => {
    const out = redact({
      otp: "123456",
      sessionToken: "abc",
      nested: { phone: "03001234567", note: "call 0300-1234567 or a@b.co" },
      route: "me.role",
    }) as Record<string, unknown>;
    expect(out.otp).toBe("[redacted]");
    expect(out.sessionToken).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).phone).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).note).toBe("call [phone] or [email]");
    expect(out.route).toBe("me.role");
  });
});

describe("seedUuid", () => {
  it("is deterministic and UUID-shaped", () => {
    expect(seedUuid("w-elec-1")).toBe(seedUuid("w-elec-1"));
    expect(seedUuid("w-elec-1")).not.toBe(seedUuid("w-elec-2"));
    expect(seedUuid("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
