import type { Metadata } from "next";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { ReportBuilder } from "@/components/ads-manager/report-builder";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PageHeader } from "@/components/ui/primitives";
import { listCampaigns } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db } = await loadAdsPage(accountId, "reports");
  let campaigns;
  try {
    campaigns = await listCampaigns(db, accountId);
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="reports" />;
  }
  return (
    <div>
      <PageHeader eyebrow="Reports" title="Reports" description="Choose a period, breakdown and columns, then export to CSV." />
      <ReportBuilder accountId={accountId} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
