import type { StepId } from "@/lib/domain/worker-profile";
import type { AllowedArea } from "../rules";
import type { Transcript } from "../schemas";

export interface AiProviders {
  /** `stepId` is used only by the fixtures provider; real providers ignore it. */
  transcribe(
    audio: { bytes: Uint8Array; mime: string },
    opts: { stepId?: StepId },
  ): Promise<Transcript>;
  /** Raw model output; the caller validates it with the Zod schema. */
  extractWorkerProfile(input: {
    stepId: StepId;
    transcript: string;
    allowedAreas: readonly AllowedArea[];
  }): Promise<unknown>;
}
