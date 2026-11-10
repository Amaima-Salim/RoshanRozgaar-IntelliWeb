/**
 * Trust rules (docs/01 O5, docs/04 AI-06/AI-07, D-10), pure and testable:
 * signals and rates, the deterministic summary, number validation for AI phrasing, flag rules.
 * Nothing here awards trust: it only counts what customers said (BR-P3).
 */
import { numberRuns } from "@/lib/ai/numbers";
import { bayesStars } from "./ranking";

/** The four yes/no tap signals (D-10). */
export const SIGNALS = ["onTime", "quality", "fairPrice", "respectful"] as const;
export type Signal = (typeof SIGNALS)[number];
export type SignalAnswers = Record<Signal, boolean | null>;

/** Fixed tag enum for AI-06 (docs/04 §3). The model may only pick from this list. */
export const REVIEW_TAGS = [
  "punctual",
  "late",
  "skilled",
  "poor_work",
  "fair_price",
  "pricey",
  "polite",
  "rude",
  "tidy",
  "hire_again",
] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];

/** A percentage is shown only when at least this many customers answered that signal. */
export const MIN_SIGNAL_SAMPLE = 3;
/** A signal below this rate (with enough answers) drives the worker's "how to improve" hint. */
export const WEAK_SIGNAL_PERCENT = 80;
export const RECENT_REVIEWS_SHOWN = 5;
export const SUMMARY_COMMENTS_MAX = 5;

export type SignalRate = { yes: number; total: number };
export type SignalRates = Record<Signal, SignalRate>;

export type ReviewFacts = {
  stars: number;
  signals: SignalAnswers;
};

export const emptyRates = (): SignalRates => ({
  onTime: { yes: 0, total: 0 },
  quality: { yes: 0, total: 0 },
  fairPrice: { yes: 0, total: 0 },
  respectful: { yes: 0, total: 0 },
});

export function computeSignalRates(reviews: readonly { signals: SignalAnswers }[]): SignalRates {
  const rates = emptyRates();
  for (const r of reviews)
    for (const s of SIGNALS) {
      const v = r.signals[s];
      if (v === null) continue;
      rates[s].total += 1;
      if (v) rates[s].yes += 1;
    }
  return rates;
}

/** Whole percent, or null when too few customers answered to say anything. */
export function signalPercent(rate: SignalRate | undefined): number | null {
  if (!rate || rate.total < MIN_SIGNAL_SAMPLE) return null;
  return Math.round((rate.yes / rate.total) * 100);
}

/** What `worker_reputation` holds, computed from review rows only. */
export function computeStars(reviews: readonly { stars: number }[]) {
  const reviewCount = reviews.length;
  if (reviewCount === 0) return { reviewCount: 0, avgStars: null, bayesStars: null };
  const avg = reviews.reduce((sum, r) => sum + r.stars, 0) / reviewCount;
  return { reviewCount, avgStars: avg, bayesStars: bayesStars(reviewCount, avg) };
}

/** Tolerant reader for the stored `signal_rates` jsonb. */
export function readRates(raw: unknown): SignalRates {
  const rates = emptyRates();
  if (!raw || typeof raw !== "object") return rates;
  for (const s of SIGNALS) {
    const v = (raw as Record<string, unknown>)[s] as Partial<SignalRate> | undefined;
    if (v && Number.isInteger(v.yes) && Number.isInteger(v.total))
      rates[s] = { yes: v.yes!, total: v.total! };
  }
  return rates;
}

export type TrustStats = {
  reviewCount: number;
  avgStars: number | null;
  jobsCompleted: number;
  repeatCustomers: number;
  rates: SignalRates;
};

/** The numbers the summary may mention: exactly what the data says, nothing else. */
export function allowedSummaryNumbers(stats: TrustStats): Set<number> {
  const set = new Set<number>([5]); // "out of 5" is the scale, not data
  set.add(stats.reviewCount);
  set.add(stats.jobsCompleted);
  set.add(stats.repeatCustomers);
  if (stats.avgStars !== null) {
    set.add(Math.round(stats.avgStars * 10) / 10);
    set.add(Math.round(stats.avgStars));
  }
  for (const s of SIGNALS) {
    const p = signalPercent(stats.rates[s]);
    if (p !== null) set.add(p);
  }
  return set;
}

const INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

/** Every number written in `text`: digits (Latin, Arabic-Indic, Persian) and number words. */
export function numbersIn(text: string): number[] {
  const ascii = text.replace(/[٠-٩۰-۹]/g, (d) => INDIC_DIGITS[d] ?? d).replace(/[٫]/g, ".");
  const digits = (ascii.match(/\d+(?:[.,]\d+)?/g) ?? []).map((m) => Number(m.replace(",", "")));
  const words = numberRuns(text).map((r) => r.value);
  // A bare multiplier ("sau", "hazar", "hundred") is still a number being claimed.
  const bare: number[] = [];
  const multipliers: [RegExp, number][] = [
    [/\b(?:hundred|sau)\b|سو/i, 100],
    [/\b(?:thousand|hazar|hazaar)\b|ہزار/i, 1000],
    [/\b(?:lakh|lac)\b|لاکھ/i, 100000],
  ];
  for (const [re, value] of multipliers) if (re.test(text)) bare.push(value);
  return [...new Set([...digits, ...words, ...bare])].filter((n) => Number.isFinite(n));
}

/** Words that would claim something this app never checks (no verification anywhere, docs/07 §5). */
const BANNED_CLAIMS =
  /\b(verified|certified|licensed|licenced|insured|guarantee[ds]?|background[- ]check(?:ed)?|nadra|cnic)\b|تصدیق\s*شدہ|مصدقہ|ضمانت|لائسنس|سرٹیفائیڈ/i;

/** True when the phrased summary mentions only allowed numbers and makes no unchecked claim. */
export function summaryIsGrounded(text: string, stats: TrustStats): boolean {
  if (BANNED_CLAIMS.test(text)) return false;
  const allowed = allowedSummaryNumbers(stats);
  return numbersIn(text).every((n) => allowed.has(n));
}

/** Deterministic two-sentence summary from the data alone. Never labelled as AI. */
export function templateSummary(stats: TrustStats): { en: string; ur: string } | null {
  if (stats.reviewCount === 0 || stats.avgStars === null) return null;
  const avg = (Math.round(stats.avgStars * 10) / 10).toFixed(1);
  const strong = SIGNALS.map((s) => ({ s, p: signalPercent(stats.rates[s]) }))
    .filter((x): x is { s: Signal; p: number } => x.p !== null && x.p >= WEAK_SIGNAL_PERCENT)
    .sort((a, b) => b.p - a.p)[0];
  const repeat = stats.repeatCustomers;
  const en =
    `Rated ${avg} out of 5 from ${stats.reviewCount} ${stats.reviewCount === 1 ? "review" : "reviews"}, ` +
    `${stats.jobsCompleted} ${stats.jobsCompleted === 1 ? "job" : "jobs"} completed` +
    (repeat > 0 ? `, ${repeat} repeat ${repeat === 1 ? "customer" : "customers"}.` : ".") +
    (strong ? ` ${strong.p}% of customers said: ${SIGNAL_EN[strong.s]}.` : "");
  const ur =
    `${stats.reviewCount} جائزوں سے 5 میں سے ${avg} ریٹنگ، ${stats.jobsCompleted} کام مکمل` +
    (repeat > 0 ? `، ${repeat} دوبارہ آنے والے گاہک۔` : "۔") +
    (strong ? ` ${strong.p}% گاہکوں نے کہا: ${SIGNAL_UR[strong.s]}۔` : "");
  return { en, ur };
}

const SIGNAL_EN: Record<Signal, string> = {
  onTime: "arrived on time",
  quality: "good quality work",
  fairPrice: "fair price",
  respectful: "respectful and safe",
};
const SIGNAL_UR: Record<Signal, string> = {
  onTime: "وقت پر آئے",
  quality: "کام اچھا تھا",
  fairPrice: "مناسب قیمت",
  respectful: "با اخلاق اور محفوظ",
};

/** The weakest signal with enough answers and under the bar, for the worker's hint. */
export function weakestSignal(rates: SignalRates): Signal | null {
  let worst: { s: Signal; p: number } | null = null;
  for (const s of SIGNALS) {
    const p = signalPercent(rates[s]);
    if (p !== null && p < WEAK_SIGNAL_PERCENT && (!worst || p < worst.p)) worst = { s, p };
  }
  return worst?.s ?? null;
}

/**
 * Rule-based abuse check for review comments (AI-06 flag, docs/04 §5). Deliberately small and
 * conservative: it only catches plain abuse/threat words in English, Roman Urdu and Urdu. A flagged
 * review keeps its stars and signals; its text is held back from public places.
 */
const ABUSE =
  /\b(fuck|shit|bastard|bitch|asshole|idiot|stupid|kill (?:you|him|them)|harami|haramzada|kutta|kamina|kameena|bewakoof|chor|thief|scam(?:mer)?|cheat(?:er)?)\b|حرامی|حرام\s*زادہ|کتا|کمینہ|چور|بیوقوف|مار\s*دوں|دھوکے?\s*باز/i;

export function commentLooksUnsafe(text: string): boolean {
  return ABUSE.test(text);
}

export const sanitizeTags = (raw: unknown): ReviewTag[] =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((t): t is ReviewTag => REVIEW_TAGS.includes(t as ReviewTag)))].slice(
        0,
        REVIEW_TAGS.length,
      )
    : [];
