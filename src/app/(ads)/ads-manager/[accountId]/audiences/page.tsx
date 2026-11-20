import type { Metadata } from "next";
import { AudienceManager } from "@/components/ads-manager/audience-manager";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PageHeader } from "@/components/ui/primitives";
import { listAudiences } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Audiences" };

export default async function AudiencesPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db, account } = await loadAdsPage(accountId, "audiences");
  let audiences;
  try {
    audiences = await listAudiences(db, accountId);
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="your audiences" />;
  }
  return (
    <div>
      <PageHeader
        eyebrow="Audiences"
        title="Audiences"
        description="Targeting uses professional and location details only. Sensitive characteristics can't be targeted, and sizes under 100 members are never shown."
      />
      <AudienceManager accountId={accountId} audiences={audiences} canEdit={roleAtLeast(account.role, "editor")} />
    </div>
  );
}
