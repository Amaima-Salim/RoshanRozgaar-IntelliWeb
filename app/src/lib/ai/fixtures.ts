import type { StepId } from "@/lib/domain/worker-profile";
import type { Transcript } from "./schemas";

/**
 * Recorded transcripts replayed when AI_MODE=fixtures (docs/04 §1.2). The UI shows a persistent
 * "Simulated AI" badge. These stand in for what a real speaker's recording would transcribe to.
 */
export const FIXTURE_TRANSCRIPTS: Record<StepId, Transcript> = {
  trade: { text: "main electrician hoon", language: "ur" },
  years: { text: "aath saal se kaam kar raha hoon", language: "ur" },
  areas: { text: "F-7 aur G-9 mein kaam karta hoon", language: "ur" },
  rate: { text: "pandrah sau rupay per visit", language: "ur" },
  schedule: { text: "somwar se jumma subah aur dopahar", language: "ur" },
  photo: { text: "", language: null },
};
