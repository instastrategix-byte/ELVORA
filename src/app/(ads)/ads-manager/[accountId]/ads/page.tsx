import type { Metadata } from "next";
import Link from "next/link";
import { EntityBadge, ReviewBadge } from "@/components/ads-manager/badges";
import { CreativeLibrary } from "@/components/ads-manager/creative-library";
import { AdControls } from "@/components/ads-manager/entity-actions";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { compactNumber, formatPercent, presetRange, roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, PageHeader } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format";
import { getMetrics, listAccountAds, listCampaigns, listCreatives, listPromotableItems } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Ads & creatives" };

export default async function AdsAndCreativesPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db, viewer, account } = await loadAdsPage(accountId, "ads");
  const { from, to } = presetRange("30d");
  let data;
  try {
    const [ads, creatives, promotable, metrics, campaigns] = await Promise.all([
      listAccountAds(db, accountId),
      listCreatives(db, accountId),
      listPromotableItems(db, viewer),
      getMetrics(db, { accountId, from, to, group: "ad", compare: "none" }),
      listCampaigns(db, accountId),
    ]);
    data = { ads, creatives, promotable, metrics, campaigns };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="your ads and creatives" />;
  }
  const metricBy = new Map(data.metrics.rows.map((r) => [r.key, r]));
  const creativeName = new Map(data.creatives.map((c) => [c.id, c.name]));
  const campaignStatus = new Map(data.campaigns.map((c) => [c.id, c.status]));
  const canEdit = roleAtLeast(account.role, "editor");
  const base = `/ads-manager/${accountId}`;

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Ads & creatives" title="Ads & creatives" description="Every ad and creative is reviewed. Changing an approved creative sends it back to review." />

      <section aria-labelledby="ads-h" className="space-y-4">
        <h2 id="ads-h" className="font-medium">
          Ads
        </h2>
        {data.ads.length === 0 ? (
          <p className="text-sm text-muted">No ads yet. Ads are created in step 6 of the campaign setup.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Ads with results for the last 30 days</caption>
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 font-medium">Ad</th>
                  <th scope="col" className="p-4 font-medium">Status</th>
                  <th scope="col" className="p-4 font-medium">Review</th>
                  <th scope="col" className="p-4 text-right font-medium">Impr.</th>
                  <th scope="col" className="p-4 text-right font-medium">CTR</th>
                  <th scope="col" className="p-4 text-right font-medium">Spent</th>
                  <th scope="col" className="p-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.ads.map((ad) => {
                  const m = metricBy.get(ad.id);
                  const st = campaignStatus.get(ad.campaignId);
                  return (
                    <tr key={ad.id}>
                      <td className="p-4">
                        <p className="font-medium">{ad.name}</p>
                        <p className="text-xs text-muted">
                          <Link className="hover:text-accent" href={`${base}/campaigns/${ad.campaignId}`}>
                            {ad.campaignName}
                          </Link>{" "}
                          · {ad.adSetName} · {creativeName.get(ad.creativeId) ?? "Creative"}
                        </p>
                      </td>
                      <td className="p-4">
                        <EntityBadge status={ad.status} />
                      </td>
                      <td className="p-4">
                        <ReviewBadge status={ad.reviewStatus} />
                      </td>
                      <td className="p-4 text-right tabular-nums">{compactNumber(m?.impressions ?? 0)}</td>
                      <td className="p-4 text-right tabular-nums">{formatPercent(m?.ctr ?? null)}</td>
                      <td className="p-4 text-right tabular-nums">{formatMoney(m?.spendMinor ?? 0, account.currency)}</td>
                      <td className="p-4">{canEdit ? <AdControls ad={ad} campaignRunning={st === "active" || st === "paused"} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <CreativeLibrary account={{ id: account.id, displayName: account.displayName }} creatives={data.creatives} promotable={data.promotable} canEdit={canEdit} />
    </div>
  );
}
