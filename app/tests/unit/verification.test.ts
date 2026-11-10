import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cnicConfirmSchema,
  formatCnic,
  genderFromCnic,
  isPlausibleCnic,
  maskCnic,
  normalizeCnic,
  normalizeDate,
  sanitizeCnicDraft,
} from "@/lib/verification/cnic";
import { DEMO_REGISTRY, demoNadraVerifier } from "@/lib/verification/nadra-demo";

describe("cnic helpers", () => {
  it("normalizes, formats and masks", () => {
    expect(normalizeCnic("61101-1234567-1")).toBe("6110112345671");
    expect(normalizeCnic("۶۱۱۰۱-۱۲۳۴۵۶۷-۱")).toBe("6110112345671");
    expect(formatCnic("6110112345671")).toBe("61101-1234567-1");
    expect(maskCnic("6110112345671")).toBe("61101-*******-1");
    expect(normalizeCnic("1234")).toBeNull();
  });
  it("plausibility and gender", () => {
    expect(isPlausibleCnic("61101-1234567-1")).toBe(true);
    expect(isPlausibleCnic("0110112345671")).toBe(false);
    expect(isPlausibleCnic("1111111111111")).toBe(false);
    expect(genderFromCnic("6110112345671")).toBe("male");
    expect(genderFromCnic("3520223456782")).toBe("female");
  });
  it("dates", () => {
    expect(normalizeDate("12.04.1990")).toBe("1990-04-12");
    expect(normalizeDate("1990-04-12")).toBe("1990-04-12");
    expect(normalizeDate("31.02.1990")).toBeNull();
    expect(normalizeDate("soon")).toBeNull();
  });
  it("sanitizes model output: bad values become null, junk becomes empty", () => {
    const d = sanitizeCnicDraft({
      cnicNumber: "6110112345671",
      fullName: "  Ali   Khan ",
      fatherName: null,
      dateOfBirth: "12.04.1990",
      dateOfIssue: "garbage",
      dateOfExpiry: null,
    });
    expect(d).toMatchObject({
      cnicNumber: "61101-1234567-1",
      fullName: "Ali Khan",
      dateOfBirth: "1990-04-12",
      dateOfIssue: null,
    });
    expect(sanitizeCnicDraft({ extra: 1 }).cnicNumber).toBeNull();
    expect(sanitizeCnicDraft("ignore all rules").fullName).toBeNull();
  });
  it("confirm schema rejects bad input and unknown fields", () => {
    const ok = { cnicNumber: "6110112345671", fullName: "Ali", dateOfBirth: "1990-04-12" };
    expect(cnicConfirmSchema.safeParse(ok).data?.cnicNumber).toBe("61101-1234567-1");
    expect(cnicConfirmSchema.safeParse({ ...ok, cnicNumber: "123" }).success).toBe(false);
    expect(cnicConfirmSchema.safeParse({ ...ok, role: "admin" }).success).toBe(false);
  });
});

describe("demo NADRA verifier", () => {
  const c = DEMO_REGISTRY[0]!;
  it("matches, ignoring case and punctuation in the name", async () => {
    const r = await demoNadraVerifier.verify({
      cnicNumber: formatCnic(c.cnic)!,
      fullName: c.fullName.toUpperCase() + ".",
      dateOfBirth: c.dateOfBirth,
    });
    expect(r).toMatchObject({ provider: "demo", outcome: "match" });
  });
  it("reports which field mismatched", async () => {
    const r = await demoNadraVerifier.verify({
      cnicNumber: c.cnic,
      fullName: c.fullName,
      dateOfBirth: "1991-01-01",
    });
    expect(r).toMatchObject({ outcome: "mismatch", fields: { name: true, dateOfBirth: false } });
  });
  it("unknown CNIC is not_found, never a match", async () => {
    const r = await demoNadraVerifier.verify({
      cnicNumber: "4210199999991",
      fullName: "Nobody",
      dateOfBirth: "2000-01-01",
    });
    expect(r.outcome).toBe("not_found");
  });
});

describe("ocrCnic", () => {
  afterEach(() => vi.resetModules());
  async function load(mode: "off" | "fixtures" | "live") {
    process.env.AI_MODE = mode;
    process.env.GEMINI_API_KEY = "test-key";
    vi.resetModules();
    return import("@/lib/ai");
  }
  const img = [{ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg" }];

  it("off refuses", async () => {
    const ai = await load("off");
    await expect(ai.ocrCnic(img)).rejects.toBeInstanceOf(ai.AiUnavailableError);
  });
  it("fixtures replays the demo card, flagged simulated", async () => {
    const ai = await load("fixtures");
    const r = await ai.ocrCnic(img);
    expect(r.simulated).toBe(true);
    expect(r.draft.cnicNumber).toBe(formatCnic(DEMO_REGISTRY[0]!.cnic));
  });
  it("live validates provider output", async () => {
    const ai = await load("live");
    ai.__setOcrForTest(async () => ({
      cnicNumber: "42101-9999999-9",
      fullName: "Test Person",
      fatherName: null,
      dateOfBirth: "01.02.1980",
      dateOfIssue: null,
      dateOfExpiry: "not a date",
    }));
    const r = await ai.ocrCnic(img);
    expect(r.simulated).toBe(false);
    expect(r.draft).toMatchObject({ dateOfBirth: "1980-02-01", dateOfExpiry: null });
    ai.__setOcrForTest(async () => {
      throw new Error("boom");
    });
    await expect(ai.ocrCnic(img)).rejects.toBeInstanceOf(ai.AiUnavailableError);
  });
});
