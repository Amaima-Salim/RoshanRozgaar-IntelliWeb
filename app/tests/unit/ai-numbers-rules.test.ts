import { describe, expect, it } from "vitest";
import { parseSpokenNumber } from "@/lib/ai/numbers";
import { extractByRules } from "@/lib/ai/rules";
import { AREAS } from "@/lib/db/seed/data";

const allowed = AREAS.map(({ slug, nameEn, nameUr }) => ({ slug, nameEn, nameUr }));
const ex = (step: Parameters<typeof extractByRules>[0], text: string) =>
  extractByRules(step, text, allowed);

describe("parseSpokenNumber (Urdu / Roman Urdu / English / digits)", () => {
  it.each([
    ["aath", 8],
    ["8", 8],
    ["۸", 8],
    ["آٹھ", 8],
    ["eight", 8],
    ["pandrah sau", 1500],
    ["پندرہ سو", 1500],
    ["1,500", 1500],
    ["do hazar", 2000],
    ["do hazar paanch sau", 2500],
    ["ek hazar do sau", 1200],
    ["dhai hazar", 2500],
    ["derh hazar", 1500],
    ["sawa sau", 125],
    ["sade teen hazar", 3500],
    ["ڈھائی ہزار", 2500],
    ["five hundred", 500],
    ["pachchis", 25],
    ["1.5 hazar", 1500],
  ])("%s → %d", (text, value) => {
    expect(parseSpokenNumber(text)).toBe(value);
  });

  it("prefers the number right before the unit word", () => {
    expect(parseSpokenNumber("teen din, aath saal", ["saal"])).toBe(8);
  });
  it("returns null when there is no number (never guesses)", () => {
    expect(parseSpokenNumber("main kaam karta hoon")).toBeNull();
    expect(parseSpokenNumber("")).toBeNull();
  });
});

describe("trade", () => {
  it.each([
    ["main electrician hoon", "electrician"],
    ["bijli ka kaam", "electrician"],
    ["میں پلمبر ہوں", "plumber"],
    ["nalka plumber", "plumber"],
    ["AC technician", "ac_technician"],
    ["a/c repair", "ac_technician"],
    ["اے سی کا کام", "ac_technician"],
    ["carpenter lakri ka kaam", "carpenter"],
    ["بڑھئی", "carpenter"],
    ["car mechanic", "mechanic"],
    ["مکینک", "mechanic"],
  ])("%s → %s", (text, trade) => {
    expect(ex("trade", text).trade).toBe(trade);
  });
  it("is null when ambiguous or unknown", () => {
    expect(ex("trade", "electrician aur plumber dono").trade).toBeNull();
    expect(ex("trade", "main doctor hoon").trade).toBeNull();
  });
});

describe("years", () => {
  it.each([
    ["aath saal se", 8],
    ["10 years", 10],
    ["پندرہ سال", 15],
    ["bees saal", 20],
    ["naya hoon", 0],
    ["8", 8],
  ])("%s → %d", (text, years) => {
    expect(ex("years", text).yearsExperience).toBe(years);
  });
  it("rejects fractions and absurd values instead of rounding", () => {
    expect(ex("years", "dhai saal").yearsExperience).toBeNull();
    expect(ex("years", "ek hazar saal").yearsExperience).toBeNull();
  });
});

describe("rate", () => {
  it("amount and basis together", () => {
    expect(ex("rate", "pandrah sau rupay per visit")).toMatchObject({
      indicativeRatePkr: 1500,
      rateBasis: "per_visit",
    });
    expect(ex("rate", "do hazar ghante ke")).toMatchObject({
      indicativeRatePkr: 2000,
      rateBasis: "per_hour",
    });
    expect(ex("rate", "پانچ سو فی وزٹ")).toMatchObject({
      indicativeRatePkr: 500,
      rateBasis: "per_visit",
    });
  });
  it("leaves a missing part empty", () => {
    expect(ex("rate", "pandrah sau")).toMatchObject({ indicativeRatePkr: 1500, rateBasis: null });
    expect(ex("rate", "per job")).toMatchObject({ indicativeRatePkr: null, rateBasis: "per_job" });
  });
  it("ignores amounts outside the allowed range", () => {
    expect(ex("rate", "paanch rupay").indicativeRatePkr).toBeNull();
    expect(ex("rate", "ek crore").indicativeRatePkr).toBeNull();
  });
});

describe("areas (only allowed slugs)", () => {
  it("matches English, spoken-digit and Urdu names", () => {
    expect(ex("areas", "F-7 aur G-9 mein").areaSlugs.sort()).toEqual(["f-7", "g-9"]);
    expect(ex("areas", "g nine aur f seven").areaSlugs.sort()).toEqual(["f-7", "g-9"]);
    expect(ex("areas", "جی نائن اور ایف سیون").areaSlugs.sort()).toEqual(["f-7", "g-9"]);
  });
  it("does not confuse G-1 with G-11", () => {
    expect(ex("areas", "G-11").areaSlugs).toEqual(["g-11"]);
  });
  it("unknown places stay empty", () => {
    expect(ex("areas", "Lahore mein").areaSlugs).toEqual([]);
  });
});

describe("schedule", () => {
  it("day ranges and day parts", () => {
    expect(ex("schedule", "somwar se jumma subah aur dopahar")).toMatchObject({
      weekdays: [1, 2, 3, 4, 5],
      dayParts: ["morning", "afternoon"],
    });
    expect(ex("schedule", "Monday to Friday evening").weekdays).toEqual([1, 2, 3, 4, 5]);
  });
  it("every day and full day", () => {
    expect(ex("schedule", "roz pura din")).toMatchObject({
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      dayParts: ["morning", "afternoon", "evening"],
    });
  });
  it("listed days; Urdu script", () => {
    expect(ex("schedule", "پیر منگل جمعہ شام").weekdays).toEqual([1, 2, 5]);
  });
  it("nothing recognised → empty", () => {
    expect(ex("schedule", "kabhi kabhi")).toMatchObject({ weekdays: [], dayParts: [] });
  });
});

describe("only the asked step's fields are filled", () => {
  it("the years step ignores a trade and a rate in the same sentence", () => {
    const d = ex("years", "electrician hoon, aath saal, pandrah sau per visit");
    expect(d.yearsExperience).toBe(8);
    expect(d.trade).toBeNull();
    expect(d.indicativeRatePkr).toBeNull();
  });
});
