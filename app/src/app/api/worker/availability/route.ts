import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { setAvailability } from "@/lib/worker/profile";

const bodySchema = z.strictObject({ isAvailable: z.boolean() });

/** The big "I'm free now" toggle. The UI shows the new state only after this succeeds. */
export const POST = route("worker.availability", async (request) => {
  const user = await requireRole("worker");
  const { isAvailable } = await parseJson(request, bodySchema);
  if (!(await setAvailability(user.id, isAvailable))) {
    throw new HttpError("CONFLICT_STATE", { reason: "onboarding_incomplete" });
  }
  return ok({ isAvailable });
});
