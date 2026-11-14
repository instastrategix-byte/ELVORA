import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CampaignForm } from "@/components/ads/campaign-forms";
import { MembershipRequired } from "@/components/business/upsell";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PageHeader } from "@/components/ui/primitives";
import { hasFeature } from "@backend/modules/auth/permissions";
import { getAdvertiserAccount, listRateCards } from "@backend/modules/ads/service";
import { listOwnListings } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const { viewer, db } = await requirePageSession({ next: "/ads/campaigns/new" });
  if (!hasFeature(viewer, "ads.manage")) {
    return <MembershipRequired title="An Advertiser membership is required" body="Apply to create sponsored campaigns." plan="advertiser" />;
  }
  let data;
  try {
    const [account, rates, listings] = await Promise.all([getAdvertiserAccount(db, viewer), listRateCards(db), listOwnListings(db, viewer)]);
    data = { account, rates, listings };
  } catch (error) {
    return <ServiceNotice error={error} what="campaign settings" />;
  }
  if (!data.account) redirect("/ads");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New campaign" description="Saved as a draft. Nothing is served until our team approves it." />
      <CampaignForm
        listings={data.listings.filter((l) => l.status === "published").map((l) => ({ id: l.id, title: l.title }))}
        currencies={[...new Set(data.rates.map((r) => r.currency))]}
      />
    </div>
  );
}
