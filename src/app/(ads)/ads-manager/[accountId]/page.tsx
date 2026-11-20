import { BarChart3, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MetricChart, MoneyBarList, StatTile } from "@/components/ads-manager/charts";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { compactNumber, dailySeries, formatPercent, formatRoas, moneyOrDash, presetRange, roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format";
import { getMetrics, listAccountReviews, listCampaigns } from "@backend/modules/advertising";
import { getBillingOverview } from "@backend/modules/advertising/billing/service";

export const metadata: Metadata = { title: "Ads Manager · Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db, account } = await loadAdsPage(accountId);
  const { from, to } = presetRange("30d");
  let data;
  try {
    const [daily, byCampaign, reviews, campaigns, billing] = await Promise.all([
      getMetrics(db, { accountId, from, to, group: "day", compare: "previous" }),
      getMetrics(db, { accountId, from, to, group: "campaign", compare: "none" }),
      listAccountReviews(db, accountId),
      listCampaigns(db, accountId),
      getBillingOverview(db, accountId),
    ]);
    data = { daily, byCampaign, reviews, campaigns, billing };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="your account overview" />;
  }
  const { daily, byCampaign, reviews, campaigns, billing } = data;
  const t = daily.totals;
  const p = daily.previous;
  const cur = daily.currency;
  const base = `/ads-manager/${accountId}`;
  const canEdit = roleAtLeast(account.role, "editor");

  const notApproved = reviews.filter((r) => (r.decision === "rejected" || r.decision === "changes_requested") && !r.appeal);
  const openAppeals = reviews.filter((r) => r.appeal?.status === "open");
  const lowBalance = billing.billingMode === "prepaid" && billing.balanceMinor <= Math.max(billing.spendTodayMinor, 0);
  const running = campaigns.filter((c) => c.status === "active" && !c.suspendedAt).length;
  const top = [...byCampaign.rows].sort((a, b) => b.spendMinor - a.spendMinor).slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview · last 30 days"
        title={account.displayName}
        description={`${running} running ${running === 1 ? "campaign" : "campaigns"} · ${campaigns.length} in total. All figures are measured delivery; nothing is estimated.`}
        actions={
          canEdit ? (
            <Button asChild>
              <Link href={`${base}/campaigns/new`}>
                <Plus /> Create campaign
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {account.status === "suspended" ? <Alert tone="error" title="This account is suspended">Ads don&apos;t run while an account is suspended. Contact support for details.</Alert> : null}
        {billing.billingStatus === "payment_failed" ? (
          <Alert tone="error" title="Your last payment failed" action={<Link className="text-accent hover:underline" href={`${base}/billing`}>Go to billing</Link>}>
            Delivery is paused until a top-up succeeds.
          </Alert>
        ) : null}
        {lowBalance ? (
          <Alert tone="warning" title={`Balance ${formatMoney(billing.balanceMinor, cur)}`} action={<Link className="text-accent hover:underline" href={`${base}/billing`}>Add funds</Link>}>
            Ads stop serving when the prepaid balance runs out.
          </Alert>
        ) : null}
        {notApproved.length ? (
          <Alert tone="warning" title={`${notApproved.length} ${notApproved.length === 1 ? "item needs" : "items need"} attention`} action={<Link className="text-accent hover:underline" href={`${base}/campaigns`}>Review campaigns</Link>}>
            Some campaigns or ads were not approved or need changes. You can edit and resubmit them, or appeal the decision.
          </Alert>
        ) : null}
        {openAppeals.length ? <Alert tone="info" title={`${openAppeals.length} open ${openAppeals.length === 1 ? "appeal" : "appeals"}`}>Our review team will reply in your notifications.</Alert> : null}
      </div>

      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">Key results</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Amount spent" value={formatMoney(t.spendMinor, cur)} current={t.spendMinor} previous={p?.spendMinor} upIsGood={false} />
          <StatTile label="Impressions" value={compactNumber(t.impressions)} current={t.impressions} previous={p?.impressions} />
          <StatTile label="Clicks" value={compactNumber(t.clicks)} current={t.clicks} previous={p?.clicks} />
          <StatTile label="Click-through rate" value={formatPercent(t.ctr)} current={t.ctr} previous={p?.ctr} />
          <StatTile label="Conversions" value={compactNumber(t.conversions)} current={t.conversions} previous={p?.conversions} hint="Install a pixel to measure conversions" />
          <StatTile label="Cost per result" value={moneyOrDash(t.cpaMinor, cur)} current={t.cpaMinor} previous={p?.cpaMinor} upIsGood={false} />
          <StatTile label="Return on ad spend" value={formatRoas(t.roas)} current={t.roas} previous={p?.roas} />
          <StatTile label="Cost per 1,000 impressions" value={moneyOrDash(t.cpmMinor, cur)} current={t.cpmMinor} previous={p?.cpmMinor} upIsGood={false} />
        </div>
        <p className="text-xs text-muted">Reach counts distinct members and can&apos;t be added up across days, so it&apos;s shown per campaign in Analytics.</p>
      </section>

      {t.impressions === 0 && t.spendMinor === 0 ? (
        <EmptyState
          icon={<BarChart3 />}
          title="No delivery yet"
          description="Results appear here once an approved campaign starts serving. Create a campaign and submit it for review to get started."
          action={
            canEdit ? (
              <Button asChild>
                <Link href={`${base}/campaigns/new`}>Create campaign</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Card className="p-5">
            <h2 className="font-medium">Daily spend</h2>
            <p className="mb-4 text-sm text-muted">Last 30 days, UTC</p>
            <MetricChart title="Daily spend, last 30 days" points={dailySeries(daily.rows, from, to, "spendMinor")} metric="spendMinor" currency={cur} />
          </Card>
          <Card className="p-5">
            <h2 className="font-medium">Top campaigns by spend</h2>
            <p className="mb-4 text-sm text-muted">Last 30 days</p>
            {top.length ? (
              <MoneyBarList
                title="Top campaigns by spend"
                currency={cur}
                items={top.map((r) => ({ key: r.key, label: r.label, value: r.spendMinor, href: `${base}/campaigns/${r.key}` }))}
              />
            ) : (
              <p className="text-sm text-muted">No campaign spend in this period.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
