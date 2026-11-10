import "server-only";
import { asc, eq } from "drizzle-orm";
import { HttpError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { areas, jobEvents, jobs, requests, reviews, users } from "@/lib/db/schema";

export type JobEventView = {
  toStatus: string;
  fromStatus: string | null;
  actorRole: "customer" | "worker" | "system";
  reason: string | null;
  at: string;
};

export type JobView = {
  id: string;
  version: number;
  status: (typeof jobs.$inferSelect)["status"];
  role: "customer" | "worker";
  pricePkr: number;
  startAt: string;
  endAt: string;
  trade: (typeof requests.$inferSelect)["trade"];
  summaryText: string | null;
  areaNameEn: string;
  areaNameUr: string;
  /** Exact address text: only ever filled for the assigned worker (BR-P8). */
  addressText: string | null;
  otherName: string;
  otherNameUr: string | null;
  conversationId: string;
  completionRequested: boolean;
  cancelReason: string | null;
  /** The customer has already reviewed this job (BR-P6: one review per job). */
  reviewed: boolean;
  events: JobEventView[];
};

/**
 * The job as one participant may see it. The customer's exact address is revealed to the worker
 * here and only here (the booking exists), never in chat or discovery (BR-P8).
 */
export async function loadJobView(jobId: string, viewerId: string): Promise<JobView> {
  const [row] = await db
    .select({ job: jobs, request: requests, area: areas })
    .from(jobs)
    .innerJoin(requests, eq(requests.id, jobs.requestId))
    .innerJoin(areas, eq(areas.slug, requests.areaSlug))
    .where(eq(jobs.id, jobId));
  if (!row || (row.job.customerId !== viewerId && row.job.workerId !== viewerId))
    throw new HttpError("NOT_FOUND");
  const role = row.job.customerId === viewerId ? "customer" : "worker";
  const otherId = role === "customer" ? row.job.workerId : row.job.customerId;

  const [other] = await db
    .select({ name: users.name, nameUr: users.nameUr })
    .from(users)
    .where(eq(users.id, otherId));
  const events = await db
    .select()
    .from(jobEvents)
    .where(eq(jobEvents.jobId, jobId))
    .orderBy(asc(jobEvents.at));

  const [review] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.jobId, jobId));

  return {
    id: row.job.id,
    version: row.job.version,
    status: row.job.status,
    role,
    pricePkr: row.job.pricePkr,
    startAt: row.job.startAt.toISOString(),
    endAt: row.job.endAt.toISOString(),
    trade: row.request.trade,
    summaryText: row.request.summaryText,
    areaNameEn: row.area.nameEn,
    areaNameUr: row.area.nameUr,
    addressText: role === "worker" ? row.request.addressText : null,
    otherName: other?.name ?? "",
    otherNameUr: other?.nameUr ?? null,
    conversationId: row.job.conversationId,
    completionRequested: row.job.completionRequestedAt !== null,
    cancelReason: row.job.cancelReason,
    reviewed: !!review,
    events: events.map((e) => ({
      toStatus: e.toStatus,
      fromStatus: e.fromStatus,
      actorRole:
        e.actorId === null ? "system" : e.actorId === row.job.customerId ? "customer" : "worker",
      reason: e.reason,
      at: e.at.toISOString(),
    })),
  };
}
