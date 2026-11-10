import { JobPage } from "@/components/booking/JobPage";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("booking.job.title") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <JobPage role="customer" jobId={(await params).id} />;
}
