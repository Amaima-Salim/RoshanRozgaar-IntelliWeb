import { describe, expect, it } from "vitest";
import {
  emptyAnswers,
  missingSteps,
  scheduleRows,
  tilesFromSchedule,
  workerProfileSchema,
} from "@/lib/domain/worker-profile";
import { sniffImage } from "@/lib/media/image";

const valid = {
  trade: "plumber",
  yearsExperience: 5,
  areaSlugs: ["f-7"],
  indicativeRatePkr: 1500,
  rateBasis: "per_visit",
  weekdays: [1, 2],
  dayParts: ["morning"],
  photoMediaId: null,
};

describe("workerProfileSchema", () => {
  it("accepts a complete profile", () => {
    expect(workerProfileSchema.safeParse(valid).success).toBe(true);
  });
  it.each([
    ["unknown trade", { trade: "astronaut" }],
    ["negative years", { yearsExperience: -1 }],
    ["fractional rate", { indicativeRatePkr: 1500.5 }],
    ["zero rate", { indicativeRatePkr: 0 }],
    ["no areas", { areaSlugs: [] }],
    ["no weekdays", { weekdays: [] }],
    ["bad weekday", { weekdays: [7] }],
    ["no day parts", { dayParts: [] }],
    ["unknown field", { role: "customer" }],
    ["bad photo id", { photoMediaId: "not-a-uuid" }],
  ])("rejects %s", (_name, patch) => {
    expect(workerProfileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("missingSteps", () => {
  it("lists every required step for a blank profile, never the optional photo", () => {
    expect(missingSteps(emptyAnswers())).toEqual(["trade", "years", "areas", "rate", "schedule"]);
  });
  it("treats 0 years as answered (a new worker is a valid answer)", () => {
    expect(missingSteps({ ...emptyAnswers(), yearsExperience: 0 })).not.toContain("years");
  });
  it("needs both a rate and a basis", () => {
    expect(missingSteps({ ...emptyAnswers(), indicativeRatePkr: 1000 })).toContain("rate");
  });
});

describe("schedule tiles <-> weekly hours", () => {
  it("merges adjacent day parts into one range per weekday", () => {
    expect(scheduleRows([1], ["morning", "afternoon"])).toEqual([
      { weekday: 1, startMin: 480, endMin: 1020 },
    ]);
  });
  it("keeps a gap as two ranges", () => {
    expect(scheduleRows([2], ["morning", "evening"])).toEqual([
      { weekday: 2, startMin: 480, endMin: 720 },
      { weekday: 2, startMin: 1020, endMin: 1320 },
    ]);
  });
  it("round-trips", () => {
    const rows = scheduleRows([5, 1, 3], ["afternoon", "evening"]);
    expect(tilesFromSchedule(rows)).toEqual({
      weekdays: [1, 3, 5],
      dayParts: ["afternoon", "evening"],
    });
  });
  it("returns nothing for an empty schedule", () => {
    expect(tilesFromSchedule([])).toEqual({ weekdays: [], dayParts: [] });
  });
});

describe("sniffImage", () => {
  it("recognises JPEG, PNG and WebP by magic bytes", () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBP");
    expect(sniffImage(webp)).toBe("image/webp");
  });
  it("rejects a renamed executable or script", () => {
    expect(sniffImage(new TextEncoder().encode("MZ\x90\0 pretend.exe"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
