import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdvertiserAccountForm } from "@/components/ads/campaign-forms";
import { MembershipRequired } from "@/components/business/upsell";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import { hasFeature } from "@backend/modules/auth/permissions";
import { getAdvertiserAccount, listCampaigns } from "@backend/modules/ads/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Advertising" };

export default async function AdsPage() {
  const { viewer, db } = await requirePageSession({ next: "/ads" });
  const canManage = hasFeature(viewer, "ads.manage");
  let data;
  try {
    const [account, campaigns] = await Promise.all([getAdvertiserAccount(db, viewer), listCampaigns(db, viewer)]);
    data = { account, campaigns };
  } catch (error) {
    return <ServiceNotice error={error} what="your campaigns" />;
  }

  if (!canManage && !data.account) {
    return (
      <div>
        <PageHeader eyebrow="Advertising" title="Reach ELVORA members" />
        <MembershipRequired
          title="An Advertiser membership is required"
          body="Advertisers create reviewed campaigns with server-enforced budgets, schedules and frequency limits, and see measured results."
          plan="advertiser"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Advertising"
        title="Campaigns"
        description="Every campaign is reviewed before it can be served. Metrics are measured impressions and clicks only."
        actions={
          data.account && canManage ? (
            <Button asChild>
              <Link href="/ads/campaigns/new">
                <Plus /> New campaign
              </Link>
            </Button>
          ) : undefined
        }
      />
      {!canManage ? <Alert tone="warning" title="Advertiser membership inactive">Existing campaigns are paused from serving until it&apos;s active again.</Alert> : null}
      {data.account?.status === "suspended" ? <Alert tone="error" title="Advertiser account suspended">Contact support for details.</Alert> : null}

      <Card className="space-y-4 p-6">
        <h2 className="display text-2xl">Advertiser account</h2>
        <AdvertiserAccountForm initial={data.account} />
      </Card>

      {data.account ? (
        data.campaigns.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Campaigns</caption>
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 font-medium">Campaign</th>
                  <th scope="col" className="p-4 font-medium">Status</th>
                  <th scope="col" className="p-4 font-medium">Schedule</th>
                  <th scope="col" className="p-4 font-medium">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="p-4">
                      <Link href={`/ads/campaigns/${c.id}`} className="font-medium hover:text-accent">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted">{c.headline}</span>
                    </td>
                    <td className="p-4"><StatusBadge status={c.status} label={c.status === "pending_review" ? "In review" : undefined} /></td>
                    <td className="p-4 whitespace-nowrap">{formatDate(c.startsOn)} – {formatDate(c.endsOn)}</td>
                    <td className="p-4 whitespace-nowrap">
                      {formatMoney(c.dailyBudgetMinor, c.currency)}/day
                      <span className="block text-xs text-muted">{formatMoney(c.totalBudgetMinor, c.currency)} total</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState icon={<Megaphone />} title="No campaigns yet" description="Create a draft, then submit it for review." />
        )
      ) : null}
    </div>
  );
}
