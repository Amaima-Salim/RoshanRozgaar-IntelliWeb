import { VerifyFlow } from "@/components/worker/verification/VerifyFlow";
import { requireRolePage } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { loadVerification } from "@/lib/verification/service";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("verify.title") };
}

/** Worker identity check: CNIC photo → OCR draft → worker confirms → DEMO NADRA check. */
export default async function WorkerVerifyPage() {
  const user = await requireRolePage("worker");
  return <VerifyFlow initial={await loadVerification(user.id)} />;
}
