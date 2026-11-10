/**
 * Spoken guidance registry: every screen/step that can "talk" has an id, a text in both
 * languages (i18n `guide.*`) and optionally a pre-generated audio file per language.
 * Audio files are generated with an Urdu (ur-PK) voice model and listed in `audio-manifest.ts`
 * (docs/04 §2, D-50). Without a file the server voice model or the browser voice reads the text,
 * and a button hides itself when nothing can speak.
 */
import type { Lang, MessageKey } from "@/lib/i18n";
import { AUDIO_FILES } from "./audio-manifest";

export const GUIDE_KEYS = {
  login: "guide.login",
  roleChooser: "guide.roleChooser",
  "onboarding.trade": "guide.onboarding.trade",
  "onboarding.years": "guide.onboarding.years",
  "onboarding.areas": "guide.onboarding.areas",
  "onboarding.rate": "guide.onboarding.rate",
  "onboarding.schedule": "guide.onboarding.schedule",
  "onboarding.photo": "guide.onboarding.photo",
  "onboarding.readback": "guide.onboarding.readback",
  customerOnboarding: "guide.customerOnboarding",
  requestNew: "guide.requestNew",
  results: "guide.results",
  workerProfile: "guide.workerProfile",
} as const satisfies Record<string, MessageKey>;

export type GuideId = keyof typeof GUIDE_KEYS;

/** Public URL of the recorded/generated prompt, or null when no file has been added yet. */
export function guideAudioSrc(id: GuideId, lang: Lang): string | null {
  const file = AUDIO_FILES[`${lang}/${id}`];
  return file ? `/audio/${lang}/${file}` : null;
}

/**
 * Fixed messages that are spoken aloud as feedback (voice failed, not understood…). They are
 * pre-generated next to the guide prompts so the most common moments need no live call.
 */
export const SPOKEN_MESSAGE_KEYS = [
  "onboarding.voice.failed",
  "onboarding.voice.denied",
  "onboarding.voice.unknownTrade",
  "onboarding.voice.unknownYears",
  "onboarding.voice.unknownAreas",
  "onboarding.voice.unknownRate",
  "onboarding.voice.unknownSchedule",
  "request.voice.failed",
  "request.voice.denied",
  "request.draftNone",
  "request.draftUnavailable",
  "onboarding.consent.body",
] as const satisfies readonly MessageKey[];

/** Pre-generated audio for a fixed message key, or null. */
export function messageAudioSrc(key: string, lang: Lang): string | null {
  const file = AUDIO_FILES[`${lang}/${key}`];
  return file ? `/audio/${lang}/${file}` : null;
}
