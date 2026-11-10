import { z } from "zod";
import {
  DAY_PART_KEYS,
  RATE_BASES,
  RATE_MAX,
  RATE_MIN,
  STEP_IDS,
  TRADES,
  YEARS_MAX,
  type DayPart,
} from "@/lib/domain/worker-profile";

/**
 * What the AI may propose for ONE onboarding step. Unknown means `null` / empty, never a guess
 * (docs/04 §1.5). Every provider output is parsed with this schema, so an injected or malformed
 * answer can only ever be a valid value of the right type or nothing.
 */
export const workerProfileDraftSchema = z.strictObject({
  trade: z.enum(TRADES).nullable(),
  yearsExperience: z.number().int().min(0).max(YEARS_MAX).nullable(),
  areaSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(8),
  indicativeRatePkr: z.number().int().min(RATE_MIN).max(RATE_MAX).nullable(),
  rateBasis: z.enum(RATE_BASES).nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  dayParts: z.array(z.enum(DAY_PART_KEYS as [DayPart, ...DayPart[]])).max(3),
});
export type WorkerProfileDraft = z.infer<typeof workerProfileDraftSchema>;

export const emptyDraft = (): WorkerProfileDraft => ({
  trade: null,
  yearsExperience: null,
  areaSlugs: [],
  indicativeRatePkr: null,
  rateBasis: null,
  weekdays: [],
  dayParts: [],
});

/** Request body of `POST /api/ai/extract-worker-profile`. The server supplies the allowed areas. */
export const extractRequestSchema = z.strictObject({
  stepId: z.enum(STEP_IDS),
  transcript: z.string().trim().min(1).max(500),
});

export const transcriptSchema = z.strictObject({
  text: z.string().max(2000),
  language: z.string().max(16).nullable(),
});
export type Transcript = z.infer<typeof transcriptSchema>;

/** Which draft fields each step is allowed to fill. Everything else is dropped. */
export const STEP_FIELDS = {
  trade: ["trade"],
  years: ["yearsExperience"],
  areas: ["areaSlugs"],
  rate: ["indicativeRatePkr", "rateBasis"],
  schedule: ["weekdays", "dayParts"],
  photo: [],
} as const satisfies Record<(typeof STEP_IDS)[number], readonly (keyof WorkerProfileDraft)[]>;

export function restrictToStep(
  step: (typeof STEP_IDS)[number],
  draft: WorkerProfileDraft,
): WorkerProfileDraft {
  const out = emptyDraft();
  for (const field of STEP_FIELDS[step]) {
    (out as Record<string, unknown>)[field] = draft[field];
  }
  return out;
}
