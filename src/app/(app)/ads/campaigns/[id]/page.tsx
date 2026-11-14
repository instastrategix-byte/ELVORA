import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CampaignActions, CampaignForm } from "@/components/ads/campaign-forms";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import { getCampaign, getCampaignReport, listRateCards } from "@backend/modules/ads/service";
import { listOwnListings } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/ads/campaigns/${id}` });
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try {
    const campaign = await getCampaign(db, id);
    if (!campaign) notFound();
    const [report, rates, listings] = await Promise.all([getCampaignReport(db, id), listRateCards(db), listOwnListings(db, viewer)]);
    data = { campaign, report, rates, listings };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return <ServiceNotice error={error} what="this campaign" />;
  }
  const { campaign: c, report } = data;
  const editable = c.status === "draft" || c.status === "rejected";
  const ended = c.endsOn < new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader eyebrow="Campaign" title={c.name} actions={<StatusBadge status={c.status} label={c.status === "pending_review" ? "In review" : undefined} />} />
      {c.status === "rejected" && c.reviewNote ? <Alert tone="warning" title="Not approved">{c.reviewNote}</Alert> : null}
      {c.status === "active" && ended ? <Alert tone="info">The schedule has ended, so this campaign is no longer served.</Alert> : null}

      <Card className="space-y-4 p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">Schedule</dt><dd>{formatDate(c.startsOn)} – {formatDate(c.endsOn)}</dd></div>
          <div><dt className="text-muted">Daily budget</dt><dd>{formatMoney(c.dailyBudgetMinor, c.currency)}</dd></div>
          <div><dt className="text-muted">Total budget</dt><dd>{formatMoney(c.totalBudgetMinor, c.currency)}</dd></div>
          <div><dt className="text-muted">Rate</dt><dd>{c.cpmMinor ? `${formatMoney(c.cpmMinor, c.currency)} CPM` : "Set at submission"}</dd></div>
        </dl>
        <CampaignActions campaign={c} />
      </Card>

      <section aria-labelledby="results">
        <h2 id="results" className="display mb-1 text-3xl">Results</h2>
        <p className="mb-4 text-sm text-muted">Measured events recorded by ELVORA. No estimates or modelled figures are included.</p>
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ["Impressions", report.totals.impressions.toLocaleString("en")],
            ["Clicks", report.totals.clicks.toLocaleString("en")],
            ["CTR", report.totals.ctr == null ? "—" : `${(report.totals.ctr * 100).toFixed(2)}%`],
            ["Spend", formatMoney(report.totals.spendMinor, c.currency)],
          ].map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="text-xs text-muted">{label}</p>
              <p className="display mt-1 text-3xl tabular-nums">{value}</p>
            </Card>
          ))}
        </div>
        {report.days.length ? (
          <Card className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Daily results</caption>
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 font-medium">Day (UTC)</th>
                  <th scope="col" className="p-4 text-right font-medium">Impressions</th>
                  <th scope="col" className="p-4 text-right font-medium">Clicks</th>
                  <th scope="col" className="p-4 text-right font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.days.map((d) => (
                  <tr key={d.day}>
                    <td className="p-4">{formatDate(d.day)}</td>
                    <td className="p-4 text-right">{d.impressions.toLocaleString("en")}</td>
                    <td className="p-4 text-right">{d.clicks.toLocaleString("en")}</td>
                    <td className="p-4 text-right">{formatMoney(d.spendMinor, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p className="mt-4 text-sm text-muted">No delivery recorded yet.</p>
        )}
      </section>

      {editable ? (
        <section>
          <h2 className="display mb-4 text-3xl">Edit campaign</h2>
          <CampaignForm
            campaign={c}
            listings={data.listings.filter((l) => l.status === "published").map((l) => ({ id: l.id, title: l.title }))}
            currencies={[...new Set(data.rates.map((r) => r.currency))]}
          />
        </section>
      ) : null}
    </div>
  );
}
