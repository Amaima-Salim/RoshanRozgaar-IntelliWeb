import { describe, expect, it } from "vitest";
import { requireIdempotencyKey } from "@/lib/api/idempotency";
import { HttpError } from "@/lib/api/respond";

const req = (key?: string) =>
  new Request("http://x.test/api/offers/1/accept", {
    method: "POST",
    headers: key === undefined ? {} : { "idempotency-key": key },
  });

describe("requireIdempotencyKey", () => {
  it("returns a well-formed key", () => {
    expect(requireIdempotencyKey(req("abcd1234-ef56"))).toBe("abcd1234-ef56");
  });

  it.each([undefined, "", "short", "has spaces in it", "x".repeat(65), "bad/char/here1"])(
    "rejects %j with VALIDATION",
    (key) => {
      expect(() => requireIdempotencyKey(req(key))).toThrow(HttpError);
      try {
        requireIdempotencyKey(req(key));
      } catch (e) {
        expect((e as HttpError).code).toBe("VALIDATION");
      }
    },
  );
});
