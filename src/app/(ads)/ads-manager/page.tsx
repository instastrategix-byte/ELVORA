import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdvertiserAccountForm } from "@/components/ads/campaign-forms";
import { MembershipRequired } from "@/components/business/upsell";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, PageHeader } from "@/components/ui/primitives";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listMyAdAccounts } from "@backend/modules/advertising";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Ads Manager" };

export default async function AdsManagerHome() {
  const { viewer, db } = await requirePageSession({ next: "/ads-manager" });
  let accounts;
  try {
    accounts = await listMyAdAccounts(db, viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="your advertising accounts" />;
  }
  if (accounts.length > 0) redirect(`/ads-manager/${accounts[0]!.id}`);

  const canCreate = hasFeature(viewer, "ads.manage");
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Ads Manager"
        title="Reach ELVORA members"
        description="Plan campaigns, target by professional profile, and see measured results. Every ad is reviewed before it runs."
      />
      {canCreate ? (
        <Card className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-accent">
              <Megaphone className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="display text-2xl">Create your advertising account</h2>
              <p className="text-sm text-muted">Your advertiser name appears on every ad as “Sponsored · name”.</p>
            </div>
          </div>
          <AdvertiserAccountForm initial={null} />
        </Card>
      ) : (
        <MembershipRequired
          title="An Advertiser membership is required"
          body="Advertisers create reviewed campaigns with server-enforced budgets, schedules and frequency limits, and see measured results. If a team member has added you to their account, it will appear here."
          plan="advertiser"
        />
      )}
    </div>
  );
}
