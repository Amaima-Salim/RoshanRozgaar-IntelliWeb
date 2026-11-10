/**
 * Worker profile rules shared by the onboarding UI and the API (docs/01 §3 O1, docs/02 §3).
 * No server-only imports: the browser uses the same schema to know what "complete" means.
 */
import { z } from "zod";

export const TRADES = ["electrician", "plumber", "ac_technician", "carpenter", "mechanic"] as const;
export type Trade = (typeof TRADES)[number];

export const RATE_BASES = ["per_visit", "per_hour", "per_job"] as const;
export type RateBasis = (typeof RATE_BASES)[number];

/** Price chips for the rate step (integer PKR, BR-P5). */
export const RATE_CHIPS = [500, 800, 1000, 1500, 2000, 3000, 5000] as const;
export const RATE_MIN = 100;
export const RATE_MAX = 100_000;
export const RATE_STEP = 100;
export const YEARS_MAX = 60;

/** Day parts for the "when are you free" tiles, in Asia/Karachi local minutes. */
export const DAY_PARTS = {
  morning: { startMin: 8 * 60, endMin: 12 * 60 },
  afternoon: { startMin: 12 * 60, endMin: 17 * 60 },
  evening: { startMin: 17 * 60, endMin: 22 * 60 },
} as const;
export type DayPart = keyof typeof DAY_PARTS;
export const DAY_PART_KEYS = Object.keys(DAY_PARTS) as DayPart[];

/** Display order Saturday-first is not assumed: Monday → Sunday, using JS weekday numbers (0 = Sunday). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const STEP_IDS = ["trade", "years", "areas", "rate", "schedule", "photo"] as const;
export type StepId = (typeof STEP_IDS)[number];
export const OPTIONAL_STEPS: readonly StepId[] = ["photo"];

/** What the worker has answered so far. Unanswered fields are `null`; nothing is guessed. */
export type ProfileAnswers = {
  trade: Trade | null;
  yearsExperience: number | null;
  areaSlugs: string[];
  indicativeRatePkr: number | null;
  rateBasis: RateBasis | null;
  weekdays: number[];
  dayParts: DayPart[];
  photoMediaId: string | null;
};

export const emptyAnswers = (): ProfileAnswers => ({
  trade: null,
  yearsExperience: null,
  areaSlugs: [],
  indicativeRatePkr: null,
  rateBasis: null,
  weekdays: [],
  dayParts: [],
  photoMediaId: null,
});

/** The body of `PUT /api/worker/profile`: everything required for a complete profile. */
export const workerProfileSchema = z.strictObject({
  trade: z.enum(TRADES),
  yearsExperience: z.number().int().min(0).max(YEARS_MAX),
  areaSlugs: z
    .array(z.string().regex(/^[a-z0-9-]{1,40}$/))
    .min(1)
    .max(8),
  indicativeRatePkr: z.number().int().min(RATE_MIN).max(RATE_MAX),
  rateBasis: z.enum(RATE_BASES),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  dayParts: z
    .array(z.enum(DAY_PART_KEYS as [DayPart, ...DayPart[]]))
    .min(1)
    .max(3),
  photoMediaId: z.uuid().nullable(),
});
export type WorkerProfileInput = z.infer<typeof workerProfileSchema>;

/** Which required steps are still unanswered (drives "Next" and the read-back). */
export function missingSteps(a: ProfileAnswers): StepId[] {
  const missing: StepId[] = [];
  if (!a.trade) missing.push("trade");
  if (a.yearsExperience === null) missing.push("years");
  if (a.areaSlugs.length === 0) missing.push("areas");
  if (a.indicativeRatePkr === null || !a.rateBasis) missing.push("rate");
  if (a.weekdays.length === 0 || a.dayParts.length === 0) missing.push("schedule");
  return missing;
}

export const isStepAnswered = (a: ProfileAnswers, step: StepId) =>
  step === "photo" ? a.photoMediaId !== null : !missingSteps(a).includes(step);

/** Weekly hours rows from the tiles: adjacent day parts merge into one range per weekday. */
export function scheduleRows(
  weekdays: readonly number[],
  dayParts: readonly DayPart[],
): { weekday: number; startMin: number; endMin: number }[] {
  const ranges = DAY_PART_KEYS.filter((p) => dayParts.includes(p)).map((p) => DAY_PARTS[p]);
  const merged: { startMin: number; endMin: number }[] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && last.endMin === r.startMin) last.endMin = r.endMin;
    else merged.push({ ...r });
  }
  return [...new Set(weekdays)]
    .sort((a, b) => a - b)
    .flatMap((weekday) => merged.map((m) => ({ weekday, ...m })));
}

/** Reverse of {@link scheduleRows}: which tiles a stored schedule corresponds to. */
export function tilesFromSchedule(
  rows: readonly { weekday: number; startMin: number; endMin: number }[],
): { weekdays: number[]; dayParts: DayPart[] } {
  const weekdays = [...new Set(rows.map((r) => r.weekday))].sort((a, b) => a - b);
  const dayParts = DAY_PART_KEYS.filter((p) => {
    const part = DAY_PARTS[p];
    // A part counts when every selected weekday covers it fully.
    return (
      weekdays.length > 0 &&
      weekdays.every((d) =>
        rows.some((r) => r.weekday === d && r.startMin <= part.startMin && r.endMin >= part.endMin),
      )
    );
  });
  return { weekdays, dayParts };
}
