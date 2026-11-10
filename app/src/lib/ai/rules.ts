/**
 * Rule-based extraction for the worker interview (docs/04 §4): trades, years, rate, areas,
 * weekdays and day parts in English, Roman Urdu and Urdu script. Deterministic, offline, and
 * conservative: anything ambiguous stays null so the app asks again.
 */
import type { StepId, RateBasis, Trade } from "@/lib/domain/worker-profile";
import { RATE_MAX, RATE_MIN, WEEKDAY_ORDER, YEARS_MAX } from "@/lib/domain/worker-profile";
import { normalizeSpeech, numberRuns, parseSpokenNumber } from "./numbers";
import { emptyDraft, restrictToStep, type WorkerProfileDraft } from "./schemas";

export type AllowedArea = { slug: string; nameEn: string; nameUr: string };

const padded = (text: string) => ` ${normalizeSpeech(text)} `;
const hasPhrase = (haystack: string, phrase: string) =>
  haystack.includes(` ${normalizeSpeech(phrase)} `);
const hasAny = (haystack: string, phrases: readonly string[]) =>
  phrases.some((p) => hasPhrase(haystack, p));

const TRADE_WORDS: Record<Trade, string[]> = {
  electrician: [
    "electrician",
    "electric",
    "wireman",
    "bijli",
    "bijlee",
    "بجلی",
    "الیکٹریشن",
    "الیکٹرک",
    "الیکٹریشین",
  ],
  plumber: ["plumber", "plumbing", "nalka", "nalke", "pani", "پلمبر", "نلکا", "پلمبنگ"],
  ac_technician: [
    "ac",
    "a c",
    "air conditioner",
    "air conditioning",
    "aircon",
    "اے سی",
    "ایئر کنڈیشن",
    "ائیر کنڈیشنر",
    "ایئر کنڈیشنر",
  ],
  carpenter: [
    "carpenter",
    "carpentry",
    "lakri",
    "barhai",
    "tarkhan",
    "بڑھئی",
    "ترکھان",
    "کارپینٹر",
    "لکڑی",
  ],
  mechanic: [
    "mechanic",
    "mistri",
    "gari",
    "gaari",
    "car",
    "motor",
    "مکینک",
    "گاڑی",
    "موٹر",
    "مستری",
  ],
};

function extractTrade(text: string): Trade | null {
  const hay = padded(text);
  const hits = (Object.keys(TRADE_WORDS) as Trade[]).filter((t) => hasAny(hay, TRADE_WORDS[t]));
  return hits.length === 1 ? hits[0]! : null;
}

const YEAR_UNITS = ["saal", "sal", "saalon", "salon", "year", "years", "yr", "yrs", "سال", "برس"];
const NEW_WORDS = ["naya", "nayi", "new", "fresh", "beginner", "نیا", "نئے", "نئی"];

function extractYears(text: string): number | null {
  const value = parseSpokenNumber(text, YEAR_UNITS);
  if (value === null) return hasAny(padded(text), NEW_WORDS) ? 0 : null;
  return Number.isInteger(value) && value >= 0 && value <= YEARS_MAX ? value : null;
}

const CURRENCY = ["rupay", "rupaye", "rupees", "rupee", "rs", "pkr", "روپے", "روپیہ", "روپئے"];
const BASIS_WORDS: Record<RateBasis, string[]> = {
  per_visit: ["visit", "wizit", "vizit", "dora", "دورہ", "وزٹ", "ویزٹ"],
  per_hour: ["ghanta", "ghante", "ghantay", "hour", "hr", "hourly", "گھنٹہ", "گھنٹے", "گھنٹا"],
  per_job: ["job", "jobs", "kaam", "kam", "جاب", "کام"],
};

function extractRate(text: string): { amount: number | null; basis: RateBasis | null } {
  const tokens = normalizeSpeech(text).split(" ");
  const valid = numberRuns(text).filter(
    (r) => Number.isInteger(r.value) && r.value >= RATE_MIN && r.value <= RATE_MAX,
  );
  const followedByMoney = valid.find((r) => CURRENCY.includes(tokens[r.end + 1] ?? ""));
  const amount = (followedByMoney ?? valid[0])?.value ?? null;
  const hay = padded(text);
  const bases = (Object.keys(BASIS_WORDS) as RateBasis[]).filter((b) =>
    hasAny(hay, BASIS_WORDS[b]),
  );
  return { amount, basis: bases.length === 1 ? bases[0]! : null };
}

const DIGIT_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  ek: "1",
  do: "2",
  teen: "3",
  char: "4",
  chaar: "4",
  paanch: "5",
  panch: "5",
  chhe: "6",
  che: "6",
  chay: "6",
  saat: "7",
  aath: "8",
  nau: "9",
  das: "10",
  gyarah: "11",
  ایک: "1",
  دو: "2",
  تین: "3",
  چار: "4",
  پانچ: "5",
  چھ: "6",
  سات: "7",
  آٹھ: "8",
  نو: "9",
  دس: "10",
  گیارہ: "11",
  سیون: "7",
  نائن: "9",
  ایٹ: "8",
  ایلیون: "11",
  الیون: "11",
  ٹین: "10",
  فائیو: "5",
  تھری: "3",
  فور: "4",
  سکس: "6",
  ون: "1",
  ٹو: "2",
};

function extractAreas(text: string, allowed: readonly AllowedArea[]): string[] {
  const norm = normalizeSpeech(text);
  const spoken = ` ${norm
    .split(" ")
    .map((w) => DIGIT_WORDS[w] ?? w)
    .join(" ")} `;
  // "g 9" / "g9" / "g-9" all compare equal once spaces are removed around a letter-digit pair.
  const compact = ` ${spoken.replace(/\b([a-z]+) (\d+)\b/g, "$1$2").trim()} `;
  const urdu = ` ${norm} `;
  const found = new Set<string>();
  for (const area of allowed) {
    const en = normalizeSpeech(area.nameEn);
    const enCompact = en.replace(/ (?=\d)/g, "");
    if (spoken.includes(` ${en} `) || compact.includes(` ${enCompact} `)) found.add(area.slug);
    if (urdu.includes(` ${normalizeSpeech(area.nameUr)} `)) found.add(area.slug);
  }
  return [...found];
}

const DAY_WORDS: Record<number, string[]> = {
  0: ["sunday", "sun", "itwar", "itwaar", "اتوار"],
  1: ["monday", "mon", "somwar", "sumwar", "peer", "pir", "پیر", "سوموار"],
  2: ["tuesday", "tue", "tues", "mangal", "mangalwar", "منگل"],
  3: ["wednesday", "wed", "budh", "budhwar", "بدھ"],
  4: ["thursday", "thu", "thurs", "jumerat", "jummerat", "jumeraat", "جمعرات"],
  5: ["friday", "fri", "juma", "jumma", "jumah", "جمعہ"],
  6: ["saturday", "sanichar", "ہفتہ"],
};
const EVERY_DAY = [
  "roz",
  "rozana",
  "daily",
  "everyday",
  "every day",
  "all days",
  "har din",
  "har roz",
  "روز",
  "روزانہ",
  "ہر دن",
  "ہر روز",
  "ساتوں دن",
];
const RANGE_WORDS = ["se", "to", "till", "until", "tak", "سے", "تک"];

const PART_WORDS = {
  morning: ["subah", "subha", "subeh", "morning", "صبح"],
  afternoon: ["dopahar", "dopehar", "dupahar", "afternoon", "دوپہر"],
  evening: ["shaam", "sham", "evening", "raat", "night", "شام", "رات"],
} as const;
const ALL_DAY = [
  "full day",
  "pura din",
  "poora din",
  "all day",
  "saara din",
  "sara din",
  "پورا دن",
  "سارا دن",
];

function extractSchedule(text: string): {
  weekdays: number[];
  dayParts: WorkerProfileDraft["dayParts"];
} {
  const words = normalizeSpeech(text).split(" ");
  const hay = padded(text);

  // Day names in the order they were spoken.
  const mentions: { day: number; at: number }[] = [];
  words.forEach((w, at) => {
    for (const [day, names] of Object.entries(DAY_WORDS)) {
      if (names.map(normalizeSpeech).includes(w)) mentions.push({ day: Number(day), at });
    }
  });

  let weekdays: number[] = [];
  if (hasAny(hay, EVERY_DAY)) {
    weekdays = [0, 1, 2, 3, 4, 5, 6];
  } else if (
    mentions.length === 2 &&
    words.slice(mentions[0]!.at + 1, mentions[1]!.at).some((w) => RANGE_WORDS.includes(w))
  ) {
    // "Monday se Friday": walk Monday-first and wrap if needed.
    const from = WEEKDAY_ORDER.indexOf(mentions[0]!.day as (typeof WEEKDAY_ORDER)[number]);
    const to = WEEKDAY_ORDER.indexOf(mentions[1]!.day as (typeof WEEKDAY_ORDER)[number]);
    for (let i = from; ; i = (i + 1) % 7) {
      weekdays.push(WEEKDAY_ORDER[i]!);
      if (i === to) break;
    }
  } else {
    weekdays = [...new Set(mentions.map((m) => m.day))];
  }

  const dayParts: WorkerProfileDraft["dayParts"] = hasAny(hay, ALL_DAY)
    ? ["morning", "afternoon", "evening"]
    : (Object.keys(PART_WORDS) as (keyof typeof PART_WORDS)[]).filter((p) =>
        hasAny(hay, PART_WORDS[p]),
      );
  return { weekdays: weekdays.sort((a, b) => a - b), dayParts };
}

/** Extracts only what `step` asks for; everything else stays empty. */
export function extractByRules(
  step: StepId,
  transcript: string,
  allowedAreas: readonly AllowedArea[],
): WorkerProfileDraft {
  const draft = emptyDraft();
  switch (step) {
    case "trade":
      draft.trade = extractTrade(transcript);
      break;
    case "years":
      draft.yearsExperience = extractYears(transcript);
      break;
    case "areas":
      draft.areaSlugs = extractAreas(transcript, allowedAreas);
      break;
    case "rate": {
      const { amount, basis } = extractRate(transcript);
      draft.indicativeRatePkr = amount;
      draft.rateBasis = basis;
      break;
    }
    case "schedule": {
      const { weekdays, dayParts } = extractSchedule(transcript);
      draft.weekdays = weekdays;
      draft.dayParts = dayParts;
      break;
    }
    case "photo":
      break;
  }
  return restrictToStep(step, draft);
}
