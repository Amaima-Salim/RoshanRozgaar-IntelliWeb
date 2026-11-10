import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const bodySchema = z.strictObject({ role: z.enum(["worker", "customer"]) });

/** Sets the role exactly once, server-side; afterwards it is immutable (docs/05 §2, §6). */
export const POST = route("me.role", async (request) => {
  const user = await requireUser();
  const { role } = await parseJson(request, bodySchema);
  const updated = await db
    .update(users)
    .set({ role })
    .where(and(eq(users.id, user.id), isNull(users.role)))
    .returning({ role: users.role });
  if (updated.length === 0) throw new HttpError("CONFLICT_STATE", undefined, { role: user.role });
  return ok({ role });
});
