import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { areas, requests } from "@/lib/db/schema";
import { nearestArea } from "@/lib/domain/geo";

const bodySchema = z.strictObject({
  trade: z.enum(["electrician", "plumber", "ac_technician", "carpenter", "mechanic"]),
  summaryText: z.string().trim().max(500).optional(),
  summaryLang: z.enum(["ur", "en"]).optional(),
  source: z.enum(["voice", "text", "tap", "photo"]),
  // No photo field yet: a media id from the client would need an ownership check (photo drafting is a later step).
  areaSlug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  urgency: z.enum(["now", "today", "scheduled"]),
  /** Required for "scheduled"; ignored for "now". */
  startAt: z.iso.datetime().optional(),
  durationMin: z.number().int().min(15).max(720).default(120),
  budgetPkr: z.number().int().positive().max(1_000_000).optional(),
});

const MAX_AHEAD_MS = 30 * 24 * 3600_000;

/** Creates an open request (docs/01 §3 O2). Location must fall inside the service area. */
export const POST = route("requests.create", async (request) => {
  const user = await requireRole("customer");
  const body = await parseJson(request, bodySchema);

  const [area] = await db.select().from(areas).where(eq(areas.slug, body.areaSlug));
  if (!area) throw new HttpError("VALIDATION", { reason: "unknown_area" });
  const point =
    body.lat !== undefined && body.lng !== undefined
      ? { lat: body.lat, lng: body.lng }
      : { lat: area.lat, lng: area.lng };
  const all = await db.select().from(areas);
  if (!nearestArea(point, all))
    throw new HttpError("VALIDATION", { reason: "outside_service_area" });

  const now = new Date();
  let startAt: Date;
  if (body.urgency === "now") startAt = now;
  else {
    if (!body.startAt) throw new HttpError("VALIDATION", { reason: "start_required" });
    startAt = new Date(body.startAt);
    if (startAt.getTime() < now.getTime() - 5 * 60_000)
      throw new HttpError("VALIDATION", { reason: "start_in_past" });
    if (startAt.getTime() > now.getTime() + MAX_AHEAD_MS)
      throw new HttpError("VALIDATION", { reason: "start_too_far" });
  }

  const [row] = await db
    .insert(requests)
    .values({
      customerId: user.id,
      trade: body.trade,
      summaryText: body.summaryText || null,
      summaryLang: body.summaryText ? (body.summaryLang ?? null) : null,
      source: body.source,
      lat: point.lat,
      lng: point.lng,
      areaSlug: area.slug,
      startAt,
      durationMin: body.durationMin,
      urgency: body.urgency,
      budgetPkr: body.budgetPkr ?? null,
    })
    .returning({ id: requests.id });
  if (!row) throw new HttpError("INTERNAL");
  return ok({ id: row.id }, { status: 201 });
});
