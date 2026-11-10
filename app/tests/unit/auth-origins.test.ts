import { describe, expect, it } from "vitest";
import { trustedOriginsFor } from "@/lib/auth/origins";

describe("trustedOriginsFor", () => {
  it("trusts only APP_URL in production", () => {
    expect(trustedOriginsFor("https://roshan.example", true)).toEqual(["https://roshan.example"]);
  });

  it("in development also trusts loopback and LAN origins on the same port", () => {
    const origins = trustedOriginsFor("http://localhost:3000", false);
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://127.0.0.1:3000");
    expect(origins).toContain("http://192.168.*.*:3000");
    expect(origins.every((o) => o.endsWith(":3000"))).toBe(true);
  });
});
