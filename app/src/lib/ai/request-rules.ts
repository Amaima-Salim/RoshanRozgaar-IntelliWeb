/**
 * Rule-based request drafting (AI-03): which trade fits a described problem, and roughly when.
 * English, Roman Urdu and Urdu script. Conservative on purpose: if two trades match or none
 * does, the answer is null and the customer taps the tile.
 */
import type { Trade } from "@/lib/domain/worker-profile";
import { normalizeSpeech } from "./numbers";

const padded = (text: string) => ` ${normalizeSpeech(text)} `;
const hasAny = (hay: string, words: readonly string[]) =>
  words.some((w) => hay.includes(` ${normalizeSpeech(w)} `));

const PROBLEM_WORDS: Record<Trade, string[]> = {
  electrician: [
    "electrician",
    "electric",
    "wiring",
    "wire",
    "switch",
    "socket",
    "short circuit",
    "fan",
    "bulb",
    "breaker",
    "bijli",
    "bijlee",
    "tar",
    "pankha",
    "بجلی",
    "الیکٹریشن",
    "تار",
    "سوئچ",
    "پنکھا",
    "پنکھے",
    "ساکٹ",
    "بلب",
  ],
  plumber: [
    "plumber",
    "plumbing",
    "leak",
    "leaking",
    "tap",
    "pipe",
    "drain",
    "geyser",
    "tank",
    "toilet",
    "flush",
    "nalka",
    "nali",
    "paani",
    "pani",
    "پلمبر",
    "نلکا",
    "نلکے",
    "نالی",
    "پائپ",
    "لیکیج",
    "گیزر",
    "ٹنکی",
    "پانی",
  ],
  ac_technician: [
    "ac",
    "a c",
    "air conditioner",
    "cooling",
    "compressor",
    "gas filling",
    "اے سی",
    "ایئر کنڈیشنر",
    "ٹھنڈک",
    "ٹھنڈا",
    "کمپریسر",
  ],
  carpenter: [
    "carpenter",
    "door",
    "wood",
    "wooden",
    "furniture",
    "cupboard",
    "wardrobe",
    "darwaza",
    "almari",
    "lakri",
    "کارپینٹر",
    "بڑھئی",
    "دروازہ",
    "الماری",
    "لکڑی",
    "فرنیچر",
  ],
  mechanic: [
    "mechanic",
    "car",
    "bike",
    "motorcycle",
    "engine",
    "gaari",
    "gari",
    "مکینک",
    "گاڑی",
    "کار",
    "موٹر سائیکل",
    "انجن",
  ],
};

export type WhenGuess = "now" | "evening" | "tomorrow";
const WHEN_WORDS: Record<WhenGuess, string[]> = {
  now: ["now", "urgent", "asap", "right away", "abhi", "foran", "ابھی", "فوری", "جلدی"],
  evening: ["evening", "tonight", "sham", "shaam", "آج شام", "شام", "رات"],
  tomorrow: ["tomorrow", "kal", "کل"],
};

export type RequestDraft = { trade: Trade | null; when: WhenGuess | null };

export const emptyRequestDraft = (): RequestDraft => ({ trade: null, when: null });

export function draftRequestByRules(text: string): RequestDraft {
  const hay = padded(text);
  const trades = (Object.keys(PROBLEM_WORDS) as Trade[]).filter((t) =>
    hasAny(hay, PROBLEM_WORDS[t]),
  );
  const whens = (Object.keys(WHEN_WORDS) as WhenGuess[]).filter((w) => hasAny(hay, WHEN_WORDS[w]));
  return {
    trade: trades.length === 1 ? trades[0]! : null,
    when: whens.length === 1 ? whens[0]! : null,
  };
}
