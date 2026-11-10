import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceLimit } from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/guards";
import { transitionBodySchema, transitionJob } from "@/lib/booking/transitions";

type Ctx = { params: Promise<{ id: string }> };

/** start / request-complete (worker), confirm-complete (customer), cancel (either, with reason). */
export const POST = route<Ctx>("jobs.transition", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const body = await parseJson(request, transitionBodySchema);
  await enforceLimit(`job-transition:${user.id}`, 30, 60);
  const job = await transitionJob(id, user.id, body);
  return ok({ job: { id: job.id, status: job.status, version: job.version } });
});
