/**
 * Rule-based spoken-number parser (docs/04 §4): digits, English words, Roman Urdu and Urdu
 * script. "aath" → 8, "pandrah sau" → 1500, "do hazar paanch sau" → 2500, "dhai hazar" → 2500.
 * Runs before any LLM; returns null rather than guessing.
 */

const UNITS: Record<string, number> = {};
const add = (value: number, ...words: string[]) => words.forEach((w) => (UNITS[w] = value));

// English
[
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
].forEach((w, i) => add(i, w));
add(30, "thirty");
add(40, "forty");
add(50, "fifty");
add(60, "sixty");
add(70, "seventy");
add(80, "eighty");
add(90, "ninety");

// Roman Urdu 0–60 plus tens
add(0, "zero", "sifar");
add(1, "ek", "aik");
add(2, "do");
add(3, "teen", "tin");
add(4, "char", "chaar");
add(5, "paanch", "panch", "pach");
add(6, "chhe", "chay", "che", "chhay", "chey");
add(7, "saat", "sat");
add(8, "aath", "ath", "ahth");
add(9, "nau");
add(10, "das");
add(11, "gyarah", "gyara", "giyarah");
add(12, "barah", "bara");
add(13, "terah", "tera");
add(14, "chaudah", "chauda", "chodah");
add(15, "pandrah", "pandra", "pandrha");
add(16, "solah", "sola");
add(17, "satrah", "satra");
add(18, "atharah", "athara");
add(19, "unnis", "unees", "unnees", "unis");
add(20, "bees", "bis");
add(21, "ikkis", "ikis");
add(22, "baais", "bais", "baees");
add(23, "teis", "teyis", "tais");
add(24, "chaubis", "chaubees");
add(25, "pachchis", "pachis", "pacchis");
add(26, "chhabbis", "chabbis", "chhabis");
add(27, "sattais", "satais");
add(28, "atthais", "athais", "athaees");
add(29, "untis", "unattis");
add(30, "tees", "tis");
add(31, "ikattis", "ikatis");
add(32, "battis", "batis");
add(33, "tentis", "taintis");
add(34, "chauntis", "chautis");
add(35, "paintis", "pentis");
add(36, "chhattis", "chattis");
add(37, "saintis", "saintees");
add(38, "artis", "adtis");
add(39, "untalis", "unchalis");
add(40, "chalis", "chaalis");
add(45, "paintalis", "pentalis");
add(50, "pachas", "pachaas");
add(55, "pachpan", "pachpun");
add(60, "saath", "sath", "saath");
add(70, "sattar");
add(80, "assi", "ashi");
add(90, "nabbe", "nabbay");

// Urdu script
add(0, "صفر");
add(1, "ایک");
add(2, "دو");
add(3, "تین");
add(4, "چار");
add(5, "پانچ");
add(6, "چھ", "چھے", "چھہ");
add(7, "سات");
add(8, "آٹھ", "اٹھ");
add(9, "نو");
add(10, "دس");
add(11, "گیارہ");
add(12, "بارہ");
add(13, "تیرہ");
add(14, "چودہ");
add(15, "پندرہ");
add(16, "سولہ");
add(17, "سترہ");
add(18, "اٹھارہ");
add(19, "انیس");
add(20, "بیس");
add(25, "پچیس");
add(30, "تیس");
add(35, "پینتیس");
add(40, "چالیس");
add(45, "پینتالیس");
add(50, "پچاس");
add(60, "ساٹھ");
add(70, "ستر");
add(80, "اسی");
add(90, "نوے");

/** "dhai" = 2.5, "derh" = 1.5, "sawa" = 1.25: only meaningful before sau/hazar. */
const FRACTIONS: Record<string, number> = {
  dhai: 2.5,
  derh: 1.5,
  sawa: 1.25,
  ڈھائی: 2.5,
  ڈیڑھ: 1.5,
  سوا: 1.25,
};
const HALF_MORE = new Set(["sade", "saade", "ساڑھے", "ساڑھے"]); // "sade teen hazar" = 3500
const MULTIPLIERS: Record<string, number> = {
  sau: 100,
  saw: 100,
  hundred: 100,
  سو: 100,
  hazar: 1000,
  hazaar: 1000,
  hajar: 1000,
  thousand: 1000,
  ہزار: 1000,
  lakh: 100_000,
  lac: 100_000,
  لاکھ: 100_000,
};

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => String(URDU_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[,،]/g, "") // "1,500" and Urdu comma
    .replace(/[^\p{L}\p{N}.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Token = { word: string; index: number };
const tokenize = (text: string): Token[] =>
  normalizeSpeech(text)
    .split(" ")
    .filter(Boolean)
    .map((word, index) => ({ word, index }));

const isNumberWord = (w: string) =>
  /^\d+(\.\d+)?$/.test(w) || w in UNITS || w in FRACTIONS || w in MULTIPLIERS || HALF_MORE.has(w);

function evaluate(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let half = false;
  let seen = false;
  for (const w of words) {
    if (/^\d+(\.\d+)?$/.test(w)) {
      current += Number(w);
      seen = true;
    } else if (HALF_MORE.has(w)) {
      half = true;
    } else if (w in FRACTIONS) {
      current += FRACTIONS[w]!;
      seen = true;
    } else if (w in UNITS) {
      current += UNITS[w]! + (half ? 0.5 : 0);
      half = false;
      seen = true;
    } else if (w in MULTIPLIERS) {
      const m = MULTIPLIERS[w]!;
      if (m === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * m;
        current = 0;
      }
      seen = true;
    }
  }
  if (!seen) return null;
  const value = total + current;
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** Maximal runs of consecutive number words, each with its value and where it ends. */
export function numberRuns(text: string): { value: number; end: number }[] {
  const tokens = tokenize(text);
  const runs: { value: number; end: number }[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (run.length) {
      const value = evaluate(run.map((t) => t.word));
      if (value !== null) runs.push({ value, end: run.at(-1)!.index });
    }
    run = [];
  };
  for (const token of tokens) {
    if (isNumberWord(token.word)) run.push(token);
    else flush();
  }
  flush();
  return runs;
}

/** The number written in `text`, or null. With `nextWords`, prefers the run right before one. */
export function parseSpokenNumber(text: string, nextWords?: readonly string[]): number | null {
  const runs = numberRuns(text);
  if (runs.length === 0) return null;
  if (nextWords) {
    const tokens = tokenize(text);
    const hit = runs.find((r) => nextWords.includes(tokens[r.end + 1]?.word ?? ""));
    if (hit) return hit.value;
  }
  return runs[0]!.value;
}
