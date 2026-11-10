import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { AREA_COOKIE, AREA_COOKIE_MAX_AGE } from "@/lib/customer/area";
import { db } from "@/lib/db/client";
import { areas, users } from "@/lib/db/schema";
import { LANG_COOKIE } from "@/lib/i18n";

const bodySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  areaSlug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  language: z.enum(["ur", "en"]),
});

/** Customer onboarding (docs/01 §3): name, area, language. Under 30 seconds, no other fields. */
export const POST = route("customer.onboarding", async (request) => {
  const user = await requireRole("customer");
  const body = await parseJson(request, bodySchema);
  const [area] = await db
    .select({ slug: areas.slug })
    .from(areas)
    .where(eq(areas.slug, body.areaSlug));
  if (!area) throw new HttpError("VALIDATION", { reason: "unknown_area" });

  await db
    .update(users)
    .set({ name: body.name, language: body.language })
    .where(eq(users.id, user.id));
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(AREA_COOKIE, area.slug, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure,
    maxAge: AREA_COOKIE_MAX_AGE,
  });
  jar.set(LANG_COOKIE, body.language, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure,
    maxAge: AREA_COOKIE_MAX_AGE,
  });
  return ok({ areaSlug: area.slug, language: body.language });
});
