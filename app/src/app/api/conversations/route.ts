import { z } from "zod";
import { ok, parseJson, route } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/guards";
import { startConversation } from "@/lib/chat/conversations";

const bodySchema = z.strictObject({ requestId: z.uuid(), workerId: z.uuid() });

/** Customer opens the one conversation for (own open request, eligible worker). Idempotent. */
export const POST = route("conversations.start", async (request) => {
  const user = await requireRole("customer");
  const { requestId, workerId } = await parseJson(request, bodySchema);
  const { id, created } = await startConversation(user.id, requestId, workerId);
  return ok({ id }, { status: created ? 201 : 200 });
});
