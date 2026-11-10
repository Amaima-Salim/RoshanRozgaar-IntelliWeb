import { z } from "zod";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { loadJobView } from "@/lib/booking/job-view";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Job + version + events, participants only. Pages poll with `?since=<version>`; when nothing
 * changed the body is just `{ unchanged: true, version }`.
 */
export const GET = route<Ctx>("jobs.get", async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
  const job = await loadJobView(id, user.id);
  const since = new URL(request.url).searchParams.get("since");
  if (since !== null && Number(since) === job.version)
    return ok({ unchanged: true as const, version: job.version });
  return ok({ unchanged: false as const, job });
});
