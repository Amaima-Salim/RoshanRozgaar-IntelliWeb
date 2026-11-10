import { asc } from "drizzle-orm";
import { AiUnavailableError, extractWorkerProfile } from "@/lib/ai";
import { extractRequestSchema } from "@/lib/ai/schemas";
import { HttpError, ok, parseJson, route } from "@/lib/api/respond";
import { enforceAiLimits } from "@/lib/api/rate-limit";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { areas } from "@/lib/db/schema";

/** One step's spoken answer → a draft of that step's field(s). Unknown stays empty (AI-02). */
export const POST = route("ai.extractWorkerProfile", async (request) => {
  const user = await requireRole("worker");
  const { stepId, transcript } = await parseJson(request, extractRequestSchema);
  await enforceAiLimits(user.id);
  // Allowed areas come from the database, never from the client.
  const allowedAreas = await db
    .select({ slug: areas.slug, nameEn: areas.nameEn, nameUr: areas.nameUr })
    .from(areas)
    .orderBy(asc(areas.slug));
  try {
    const { draft, source, simulated } = await extractWorkerProfile({
      stepId,
      transcript,
      allowedAreas,
    });
    return ok({ draft, source, simulated });
  } catch (err) {
    if (err instanceof AiUnavailableError)
      throw new HttpError("AI_UNAVAILABLE", { reason: err.reason });
    throw err;
  }
});
