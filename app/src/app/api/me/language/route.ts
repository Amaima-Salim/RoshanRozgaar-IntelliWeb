import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { ok, parseJson, route } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { LANG_COOKIE } from "@/lib/i18n";

const bodySchema = z.strictObject({ language: z.enum(["ur", "en"]) });

/** Language toggle: cookie for everyone, plus the user's saved preference when signed in. */
export const POST = route("me.language", async (request) => {
  const { language } = await parseJson(request, bodySchema);
  (await cookies()).set(LANG_COOKIE, language, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  const user = await getSession();
  if (user) await db.update(users).set({ language }).where(eq(users.id, user.id));
  return ok({ language });
});
