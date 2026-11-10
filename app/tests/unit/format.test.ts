import { describe, expect, it } from "vitest";
import { formatKarachiTime, karachiLocalParts } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";

describe("Asia/Karachi time helpers", () => {
  it("resolves weekday and local minutes (UTC+5)", () => {
    // 2026-11-10 is a Tuesday. 20:30 UTC = 01:30 on Wednesday in Karachi.
    expect(karachiLocalParts(new Date("2026-11-10T20:30:00Z"))).toEqual({
      weekday: 3,
      minuteOfDay: 90,
    });
    expect(karachiLocalParts(new Date("2026-11-10T05:00:00Z"))).toEqual({
      weekday: 2,
      minuteOfDay: 600,
    });
  });

  it("formats 12-hour times with Western digits in both languages", () => {
    const d = new Date("2026-11-10T10:00:00Z");
    expect(formatKarachiTime(d, "en")).toMatch(/^3:00\s?pm$/i);
    expect(formatKarachiTime(d, "ur")).toMatch(/3:00/);
    expect(formatKarachiTime(d, "ur")).not.toMatch(/[۰-۹٠-٩]/);
  });
});

describe("formatPkr", () => {
  it("formats integer rupees", () => {
    expect(formatPkr(1500)).toBe("Rs 1,500");
    expect(formatPkr(250000)).toBe("Rs 250,000");
  });

  it("refuses fractional amounts (money is integer PKR)", () => {
    expect(() => formatPkr(10.5)).toThrow();
  });
});
