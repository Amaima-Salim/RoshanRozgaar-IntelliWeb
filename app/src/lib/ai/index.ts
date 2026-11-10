/**
 * AI task functions (docs/04 §1): provider-abstracted, mode-aware, time-boxed and validated.
 * Every failure becomes an AiUnavailableError (or an empty draft); the UI then uses taps.
 * Names, phones, emails and addresses never reach a provider.
 */
import "server-only";
import { getConfig } from "@/lib/config";
import type { StepId } from "@/lib/domain/worker-profile";
import { log } from "@/lib/log";
import { AiUnavailableError } from "./errors";
import { FIXTURE_REQUEST_TRANSCRIPT, FIXTURE_TRANSCRIPTS } from "./fixtures";
import {
  DRAFT_REQUEST_SYSTEM,
  EXTRACT_SYSTEM,
  draftRequestUserPrompt,
  extractUserPrompt,
} from "./prompts";
import { geminiJson } from "./providers/gemini";
import { groqTranscribe } from "./providers/groq";
import { azureSpeak, geminiSpeak, type SpeechAudio, type SpeechLang } from "./providers/tts";
import type { AiProviders } from "./providers/types";
import { draftRequestByRules, emptyRequestDraft, type RequestDraft } from "./request-rules";
import { extractByRules, type AllowedArea } from "./rules";
import {
  emptyDraft,
  requestDraftSchema,
  restrictToStep,
  workerProfileDraftSchema,
  type Transcript,
  type WorkerProfileDraft,
} from "./schemas";

export { AiUnavailableError } from "./errors";
export { ocrCnic, __setOcrForTest } from "./ocr";

/** Test seam: replaces the network providers (failure injection, contract tests). */
let override: AiProviders | null = null;
export function __setAiProvidersForTest(p: AiProviders | null) {
  override = p;
}

function liveProviders(): AiProviders {
  const { ai } = getConfig();
  return {
    async transcribe(audio) {
      if (!ai.groqApiKey) throw new AiUnavailableError("no_key");
      return groqTranscribe(audio, {
        apiKey: ai.groqApiKey,
        model: ai.groqSttModel,
        timeoutMs: ai.timeoutMs,
      });
    },
    async extractWorkerProfile({ stepId, transcript, allowedAreas }) {
      if (!ai.geminiApiKey) throw new AiUnavailableError("no_key");
      return geminiJson(EXTRACT_SYSTEM, extractUserPrompt(stepId, transcript, allowedAreas), {
        apiKey: ai.geminiApiKey,
        model: ai.geminiModel,
        timeoutMs: ai.timeoutMs,
      });
    },
    async draftRequest({ text }) {
      if (!ai.geminiApiKey) throw new AiUnavailableError("no_key");
      return geminiJson(DRAFT_REQUEST_SYSTEM, draftRequestUserPrompt(text), {
        apiKey: ai.geminiApiKey,
        model: ai.geminiModel,
        timeoutMs: ai.timeoutMs,
      });
    },
    async speak({ text, lang }) {
      const { tts } = ai;
      if (tts.provider === "azure") {
        if (!tts.azureKey || !tts.azureRegion) throw new AiUnavailableError("no_key");
        return azureSpeak(text, lang, {
          apiKey: tts.azureKey,
          region: tts.azureRegion,
          urVoice: tts.azureUrVoice,
          timeoutMs: tts.timeoutMs,
        });
      }
      if (!ai.geminiApiKey) throw new AiUnavailableError("no_key");
      return geminiSpeak(text, lang, {
        apiKey: ai.geminiApiKey,
        model: tts.geminiModel,
        timeoutMs: tts.timeoutMs,
      });
    },
  };
}

export type AiResult<T> = T & { simulated: boolean };

/**
 * Speech to text. `fixtures` replays a recorded transcript for the step (or the customer
 * request fixture when `purpose` is "request"); `off` refuses.
 */
export async function transcribe(
  audio: { bytes: Uint8Array; mime: string },
  opts: { stepId?: StepId; purpose?: "onboarding" | "request" },
): Promise<AiResult<{ transcript: Transcript }>> {
  const { mode } = getConfig().ai;
  if (mode === "off") throw new AiUnavailableError("off");
  if (mode === "fixtures") {
    const transcript =
      opts.purpose === "request"
        ? FIXTURE_REQUEST_TRANSCRIPT
        : opts.stepId
          ? FIXTURE_TRANSCRIPTS[opts.stepId]
          : undefined;
    if (!transcript || !transcript.text) throw new AiUnavailableError("invalid");
    return { transcript, simulated: true };
  }
  const providers = override ?? liveProviders();
  try {
    const transcript = await providers.transcribe(audio, { stepId: opts.stepId });
    if (!transcript.text.trim()) throw new AiUnavailableError("invalid");
    return { transcript, simulated: false };
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    log.warn("ai.transcribe_failed", { error: err });
    throw new AiUnavailableError("provider");
  }
}

const hasAnything = (d: WorkerProfileDraft) =>
  d.trade !== null ||
  d.yearsExperience !== null ||
  d.areaSlugs.length > 0 ||
  d.indicativeRatePkr !== null ||
  d.rateBasis !== null ||
  d.weekdays.length > 0 ||
  d.dayParts.length > 0;

/**
 * Worker profile extraction for ONE step (AI-02). Rules run first (offline, deterministic);
 * the LLM is asked only when rules found nothing and only in live mode. Unknown stays empty.
 */
export async function extractWorkerProfile(input: {
  stepId: StepId;
  transcript: string;
  allowedAreas: readonly AllowedArea[];
}): Promise<AiResult<{ draft: WorkerProfileDraft; source: "rules" | "llm" | "none" }>> {
  const { mode } = getConfig().ai;
  if (mode === "off") throw new AiUnavailableError("off");
  const simulated = mode === "fixtures";

  const byRules = extractByRules(input.stepId, input.transcript, input.allowedAreas);
  if (hasAnything(byRules) || simulated) {
    return { draft: byRules, source: hasAnything(byRules) ? "rules" : "none", simulated };
  }

  const providers = override ?? liveProviders();
  try {
    const raw = await providers.extractWorkerProfile(input);
    const parsed = workerProfileDraftSchema.safeParse(raw);
    if (!parsed.success) return { draft: emptyDraft(), source: "none", simulated };
    const allowed = new Set(input.allowedAreas.map((a) => a.slug));
    const checked = restrictToStep(input.stepId, {
      ...parsed.data,
      // Only areas that actually exist: a made-up slug is dropped, not trusted.
      areaSlugs: [...new Set(parsed.data.areaSlugs.filter((s) => allowed.has(s)))],
    });
    return { draft: checked, source: hasAnything(checked) ? "llm" : "none", simulated };
  } catch (err) {
    // Provider down, timed out or rate limited: the rules found nothing, so ask again by tap.
    if (!(err instanceof AiUnavailableError)) log.warn("ai.extract_failed", { error: err });
    return { draft: emptyDraft(), source: "none", simulated };
  }
}

/**
 * Request drafting (AI-03): which trade fits the described problem, and a rough time. Rules first;
 * the LLM only when the rules found no trade, and only in live mode. The customer confirms.
 */
export async function draftRequest(input: {
  text: string;
}): Promise<AiResult<{ draft: RequestDraft; source: "rules" | "llm" | "none" }>> {
  const { mode } = getConfig().ai;
  if (mode === "off") throw new AiUnavailableError("off");
  const simulated = mode === "fixtures";

  const byRules = draftRequestByRules(input.text);
  if (byRules.trade !== null || simulated) {
    return { draft: byRules, source: byRules.trade !== null ? "rules" : "none", simulated };
  }
  const providers = override ?? liveProviders();
  try {
    const parsed = requestDraftSchema.safeParse(await providers.draftRequest(input));
    if (!parsed.success) return { draft: byRules, source: "none", simulated };
    // Keep a time the rules found; the model's trade is a proposal the customer confirms.
    const draft = { trade: parsed.data.trade, when: byRules.when ?? parsed.data.when };
    return { draft, source: draft.trade !== null ? "llm" : "none", simulated };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) log.warn("ai.draft_request_failed", { error: err });
    return { draft: emptyRequestDraft(), source: "none", simulated };
  }
}

export type { SpeechAudio, SpeechLang } from "./providers/tts";

/** Small in-memory cache: guide prompts repeat, and free TTS quotas are tight. */
const speechCache = new Map<string, SpeechAudio>();
const SPEECH_CACHE_MAX = 64;

/**
 * Text to speech in Urdu (ur-PK) or English. Live mode only: `fixtures` has no recorded audio for
 * arbitrary text and says so (the client then uses the browser voice), `off` refuses.
 */
export async function speak(input: { text: string; lang: SpeechLang }): Promise<SpeechAudio> {
  const { mode, tts } = getConfig().ai;
  if (mode === "off") throw new AiUnavailableError("off");
  if (mode === "fixtures") throw new AiUnavailableError("invalid");
  const text = input.text.trim();
  if (!text) throw new AiUnavailableError("invalid");
  const key = `${tts.provider}:${input.lang}:${text}`;
  const hit = speechCache.get(key);
  if (hit) return hit;
  const providers = override ?? liveProviders();
  try {
    const audio = await providers.speak({ text, lang: input.lang });
    if (audio.bytes.length === 0) throw new AiUnavailableError("invalid");
    if (speechCache.size >= SPEECH_CACHE_MAX) {
      speechCache.delete(speechCache.keys().next().value!);
    }
    speechCache.set(key, audio);
    return audio;
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    log.warn("ai.speak_failed", { error: err });
    throw new AiUnavailableError("provider");
  }
}
