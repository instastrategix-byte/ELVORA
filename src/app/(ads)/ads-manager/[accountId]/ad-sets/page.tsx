import { Layers } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EntityBadge } from "@/components/ads-manager/badges";
import { AdSetToggle } from "@/components/ads-manager/entity-actions";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { compactNumber, formatPercent, presetRange, roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format";
import { BID_STRATEGY_LABELS, PLACEMENT_LABELS } from "@backend/modules/advertising/constants";
import { getMetrics, listAccountAdSets } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Ad sets" };

export default async function AdSetsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db, account } = await loadAdsPage(accountId, "ad-sets");
  const { from, to } = presetRange("30d");
  let data;
  try {
    const [sets, metrics] = await Promise.all([listAccountAdSets(db, accountId), getMetrics(db, { accountId, from, to, group: "ad_set", compare: "none" })]);
    data = { sets, metrics };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="your ad sets" />;
  }
  const metricBy = new Map(data.metrics.rows.map((r) => [r.key, r]));
  const base = `/ads-manager/${accountId}`;
  const canEdit = roleAtLeast(account.role, "editor");
  const cur = account.currency;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ad sets" title="Ad sets" description="Ad sets hold the audience, placements, bidding and frequency for a campaign. Results show the last 30 days." />
      {data.sets.length === 0 ? (
        <EmptyState icon={<Layers />} title="No ad sets yet" description="Ad sets are created in step 3 of the campaign setup." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">Ad sets with results for the last 30 days</caption>
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="p-4 font-medium">Ad set</th>
                <th scope="col" className="p-4 font-medium">Status</th>
                <th scope="col" className="p-4 font-medium">Placements</th>
                <th scope="col" className="p-4 font-medium">Bidding</th>
                <th scope="col" className="p-4 text-right font-medium">Spent</th>
                <th scope="col" className="p-4 text-right font-medium">Reach</th>
                <th scope="col" className="p-4 text-right font-medium">CTR</th>
                <th scope="col" className="p-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.sets.map((s) => {
                const m = metricBy.get(s.id);
                return (
                  <tr key={s.id}>
                    <td className="p-4">
                      <p className="font-medium">{s.name}</p>
                      <Link href={`${base}/campaigns/${s.campaignId}`} className="text-xs text-muted hover:text-accent">
                        {s.campaignName}
                      </Link>
                      <span className="block text-xs text-muted">
                        {s.adCount} {s.adCount === 1 ? "ad" : "ads"}
                      </span>
                    </td>
                    <td className="p-4">
                      <EntityBadge status={s.status} />
                    </td>
                    <td className="max-w-56 p-4 text-xs text-muted">{s.placements.map((p) => PLACEMENT_LABELS[p]).join(", ")}</td>
                    <td className="p-4 text-xs">
                      {BID_STRATEGY_LABELS[s.bidStrategy]}
                      {s.bidMinor !== null ? <span className="block text-muted">bid {formatMoney(s.bidMinor, cur)}</span> : null}
                      <span className="block text-muted">≤ {s.frequencyCapPerDay}/day per member</span>
                    </td>
                    <td className="p-4 text-right tabular-nums">{formatMoney(m?.spendMinor ?? 0, cur)}</td>
                    <td className="p-4 text-right tabular-nums">{compactNumber(m?.reach ?? 0)}</td>
                    <td className="p-4 text-right tabular-nums">{formatPercent(m?.ctr ?? null)}</td>
                    <td className="p-4 text-right">{canEdit ? <AdSetToggle set={s} currency={cur} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
