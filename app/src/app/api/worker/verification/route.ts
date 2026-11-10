import { z } from "zod";
import { ok, parseJson, route } from "@/lib/api/respond";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireRole } from "@/lib/auth/guards";
import { cnicConfirmSchema } from "@/lib/verification/cnic";
import { loadVerification, submitVerification } from "@/lib/verification/service";

/** Current identity-check status (DEMO NADRA check, not a real one). */
export const GET = route("worker.verification.get", async () => {
  const user = await requireRole("worker");
  return ok(await loadVerification(user.id));
});

const bodySchema = cnicConfirmSchema.extend({
  frontMediaId: z.uuid(),
  backMediaId: z.uuid().nullish(),
  ocrSource: z.enum(["ai", "fixtures", "manual"]),
  ocrDraft: z.record(z.string(), z.string().nullable()).nullish(),
});

/** The worker confirms the (possibly edited) card details; the demo NADRA check runs here. */
export const POST = route("worker.verification.submit", async (request) => {
  const user = await requireRole("worker");
  await enforceLimit(`verify:${user.id}`, 10, 3600);
  const body = await parseJson(request, bodySchema);
  return ok(await submitVerification(user.id, body));
});
