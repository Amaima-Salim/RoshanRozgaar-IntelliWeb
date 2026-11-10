/**
 * Spoken guidance registry: every screen/step that can "talk" has an id, a text in both
 * languages (i18n `guide.*`) and optionally a pre-generated audio file per language.
 * Audio files are listed in `audio-manifest.ts` once they exist (docs/04 §2). Until then the
 * browser's own voice reads the text, and a button hides itself when neither is available.
 */
import type { Lang, MessageKey } from "@/lib/i18n";
import { AUDIO_AVAILABLE } from "./audio-manifest";

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
  return AUDIO_AVAILABLE.has(`${lang}/${id}`) ? `/audio/${lang}/${id}.mp3` : null;
}
