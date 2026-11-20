import type { Metadata } from "next";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { compactNumber, presetRange, roleAtLeast } from "@/components/ads-manager/model";
import { TrackingPanel } from "@/components/ads-manager/tracking-panel";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, PageHeader } from "@/components/ui/primitives";
import { siteUrl } from "@/lib/env";
import { formatMoney, titleCase } from "@/lib/format";
import { conversionSummary, listIntegrations } from "@backend/modules/advertising/tracking/service";

export const metadata: Metadata = { title: "Ads Manager · Tracking & pixels" };

export default async function TrackingPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db, account } = await loadAdsPage(accountId, "tracking");
  const { from, to } = presetRange("30d");
  let data;
  try {
    const [integrations, summary] = await Promise.all([listIntegrations(db, accountId), conversionSummary(db, { account: accountId, from, to })]);
    data = { integrations, summary };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="tracking" />;
  }
  const { summary } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tracking & pixels"
        title="Tracking & pixels"
        description="Measure what happens on your website after an ad click. Conversions are stored only with the visitor's consent."
      />

      <section aria-labelledby="conv" className="space-y-3">
        <h2 id="conv" className="font-medium">
          Conversions · last 30 days
        </h2>
        {summary.byEvent.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No conversions received in this period.</Card>
        ) : (
          <Card className="overflow-x-auto p-2">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Conversions by event, last 30 days</caption>
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="p-3 font-medium">Event</th>
                  <th scope="col" className="p-3 text-right font-medium">Received</th>
                  <th scope="col" className="p-3 text-right font-medium">Attributed to ads</th>
                  <th scope="col" className="p-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {summary.byEvent.map((e) => (
                  <tr key={e.event}>
                    <th scope="row" className="p-3 text-left font-normal">
                      {e.event.startsWith("custom:") ? `Custom: ${e.event.slice(7)}` : titleCase(e.event)}
                    </th>
                    <td className="p-3 text-right">{compactNumber(e.total)}</td>
                    <td className="p-3 text-right">{compactNumber(e.attributed)}</td>
                    <td className="p-3 text-right">
                      {Object.entries(e.valueMinor)
                        .map(([c, v]) => formatMoney(v, c))
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.truncated ? <p className="p-3 text-xs text-muted">Showing the first 20,000 events in this period.</p> : null}
          </Card>
        )}
      </section>

      <section aria-labelledby="integrations" className="space-y-3">
        <h2 id="integrations" className="font-medium">
          Integrations
        </h2>
        <TrackingPanel accountId={accountId} integrations={data.integrations} canManage={roleAtLeast(account.role, "admin")} origin={new URL(siteUrl("/")).origin} />
      </section>
    </div>
  );
}
