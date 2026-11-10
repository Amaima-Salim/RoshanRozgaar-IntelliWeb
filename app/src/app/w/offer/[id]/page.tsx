import { OfferAcceptPage } from "@/components/booking/OfferAcceptPage";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("booking.accept.title") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OfferAcceptPage role="worker" offerId={(await params).id} />;
}
