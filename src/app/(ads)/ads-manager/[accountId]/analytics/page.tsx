import type { Metadata } from "next";
import { AnalyticsView } from "@/components/ads-manager/analytics-view";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PageHeader } from "@/components/ui/primitives";
import { listCampaigns } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Analytics" };

export default async function AnalyticsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db } = await loadAdsPage(accountId, "analytics");
  let campaigns;
  try {
    campaigns = await listCampaigns(db, accountId);
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="analytics" />;
  }
  return (
    <div>
      <PageHeader eyebrow="Analytics" title="Analytics" description="Measured delivery and attributed conversions. Filters apply to everything on this page." />
      <AnalyticsView accountId={accountId} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
