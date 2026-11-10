import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/auth/guards";
import { HttpError } from "@/lib/api/respond";
import { loadJobView, type JobView } from "@/lib/booking/job-view";
import { JobScreen } from "./JobScreen";

/** /c/job/[id] and /w/job/[id]: the job as this participant sees it (Figma 12). */
export async function JobPage({ role, jobId }: { role: "customer" | "worker"; jobId: string }) {
  const user = await requireRolePage(role);
  if (!/^[0-9a-f-]{36}$/.test(jobId)) notFound();
  let job: JobView;
  try {
    job = await loadJobView(jobId, user.id);
  } catch (err) {
    if (err instanceof HttpError) notFound();
    throw err;
  }
  // A customer opening the worker's URL (or the reverse) lands on their own view.
  if (job.role !== role) notFound();
  return <JobScreen initial={job} />;
}
