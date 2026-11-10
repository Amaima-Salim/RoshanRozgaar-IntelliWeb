import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, ok, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import { findCandidates } from "@/lib/discovery/candidates";

const radiusSchema = z.coerce.number().min(1).max(30);

export const GET = route<{ params: Promise<{ id: string }> }>(
  "requests.candidates",
  async (request, ctx) => {
    const user = await requireRole("customer");
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new HttpError("NOT_FOUND");
    const [req] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.customerId, user.id)));
    if (!req) throw new HttpError("NOT_FOUND");

    const raw = new URL(request.url).searchParams.get("radiusKm");
    const parsed = raw === null ? undefined : radiusSchema.safeParse(raw);
    if (parsed && !parsed.success) throw new HttpError("VALIDATION", { reason: "radius" });
    return ok(await findCandidates(req, { radiusKm: parsed?.data }));
  },
);
