import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { workerProfileSchema } from "@/lib/domain/worker-profile";
import { ProfileInputError, saveWorkerProfile } from "@/lib/worker/profile";

/** Saves the confirmed onboarding answers and completes onboarding (docs/01 §3 O1). */
export const PUT = route("worker.profile.put", async (request) => {
  const user = await requireRole("worker");
  const input = await parseJson(request, workerProfileSchema);
  try {
    await saveWorkerProfile(user.id, input);
  } catch (err) {
    if (err instanceof ProfileInputError) throw new HttpError("VALIDATION", { reason: err.reason });
    throw err;
  }
  return ok({ onboardingStatus: "complete" as const });
});
