import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdPreview } from "@/components/ads-manager/ad-preview";
import { CampaignStatusBadge, EntityBadge, ReviewBadge } from "@/components/ads-manager/badges";
import { CampaignActions } from "@/components/ads-manager/campaign-actions";
import { MetricChart, StatTile } from "@/components/ads-manager/charts";
import { AdControls, AdSetToggle, AppealButton } from "@/components/ads-manager/entity-actions";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { campaignActionsFor, compactNumber, dailySeries, formatPercent, moneyOrDash, presetRange, roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/primitives";
import { formatMoney, titleCase } from "@/lib/format";
import { BID_STRATEGY_LABELS, OBJECTIVE_LABELS, PLACEMENT_LABELS } from "@backend/modules/advertising/constants";
import { getCampaignDetail, getMetrics, listAccountReviews } from "@backend/modules/advertising";
import { LocalTime } from "@/components/ui/local-time";

export const metadata: Metadata = { title: "Ads Manager · Campaign" };

function targetingSummary(t: Record<string, unknown>): string {
  const parts = Object.entries(t)
    .filter(([k, v]) => Array.isArray(v) && v.length && !k.endsWith("audience_ids"))
    .map(([k, v]) => `${titleCase(k)}: ${(v as string[]).join(", ")}`);
  return parts.length ? parts.join(" · ") : "All eligible members";
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ accountId: string; campaignId: string }> }) {
  const { accountId, campaignId } = await params;
  const { db, account } = await loadAdsPage(accountId, `campaigns/${campaignId}`);
  if (!z.uuid().safeParse(campaignId).success) notFound();
  const { from, to } = presetRange("30d");
  let data;
  try {
    const campaign = await getCampaignDetail(db, campaignId);
    if (!campaign || campaign.accountId !== accountId) notFound();
    const [metrics, reviews] = await Promise.all([
      getMetrics(db, { accountId, from, to, group: "day", campaignId, compare: "previous" }),
      listAccountReviews(db, accountId),
    ]);
    data = { campaign, metrics, reviews };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="this campaign" />;
  }
  const { campaign: c, metrics } = data;
  const base = `/ads-manager/${accountId}`;
  const canEdit = roleAtLeast(account.role, "editor");
  const editable = canEdit && c.structure === "managed" && !c.archivedAt && (c.status === "draft" || c.status === "rejected");
  const running = c.status === "active" || c.status === "paused";
  const entityIds = new Set([c.id, ...c.adSets.flatMap((s) => s.ads.map((a) => a.id)), ...c.creatives.map((x) => x.id)]);
  const reviews = data.reviews.filter((r) => entityIds.has(r.entityId));
  const t = metrics.totals;
  const p = metrics.previous;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={OBJECTIVE_LABELS[c.objective]}
        title={c.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={c.status} archived={Boolean(c.archivedAt)} suspended={Boolean(c.suspendedAt)} />
            <span>
              <LocalTime iso={c.startsOn} format="date" /> – <LocalTime iso={c.endsOn} format="date" />
            </span>
          </span>
        }
        actions={
          <>
            {editable ? (
              <Button asChild variant="secondary">
                <Link href={`${base}/campaigns/new?campaign=${c.id}`}>
                  <Pencil /> {c.status === "draft" ? "Continue setup" : "Edit and resubmit"}
                </Link>
              </Button>
            ) : null}
            <CampaignActions accountId={accountId} campaignId={c.id} actions={campaignActionsFor(c, account.role).filter((a) => a !== "submit" || c.adSets.some((s) => s.ads.length))} variant="buttons" />
          </>
        }
      />

      {c.suspendedAt ? <Alert tone="error" title="Suspended by ELVORA">This campaign was suspended after review and can&apos;t be resumed by the account. You can appeal below.</Alert> : null}
      {c.reviewNote && (c.status === "rejected" || c.status === "draft") ? <Alert tone="warning" title="Reviewer note">{c.reviewNote}</Alert> : null}
      {c.structure === "legacy" ? <Alert tone="info">This campaign uses the original single-ad format. Duplicate it to manage it with ad sets and creatives.</Alert> : null}
      {c.status === "draft" && !c.adSets.some((s) => s.ads.length) ? <Alert tone="info">Add an ad set and an ad before submitting for review.</Alert> : null}

      <section aria-labelledby="results" className="space-y-3">
        <h2 id="results" className="font-medium">
          Results · last 30 days
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Amount spent" value={formatMoney(t.spendMinor, c.currency)} current={t.spendMinor} previous={p?.spendMinor} upIsGood={false} />
          <StatTile label="Impressions" value={compactNumber(t.impressions)} current={t.impressions} previous={p?.impressions} />
          <StatTile label="Clicks" value={compactNumber(t.clicks)} current={t.clicks} previous={p?.clicks} />
          <StatTile label="Click-through rate" value={formatPercent(t.ctr)} current={t.ctr} previous={p?.ctr} />
        </div>
        {t.impressions > 0 ? (
          <Card className="p-5">
            <MetricChart title={`Daily impressions for ${c.name}`} points={dailySeries(metrics.rows, from, to, "impressions")} metric="impressions" currency={c.currency} />
          </Card>
        ) : null}
      </section>

      <Card className="p-6">
        <h2 className="mb-4 font-medium">Settings</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Budget</dt>
            <dd>{c.budgetType === "daily" ? `${formatMoney(c.dailyBudgetMinor, c.currency)} per day` : `${formatMoney(c.totalBudgetMinor, c.currency)} lifetime`}</dd>
          </div>
          <div>
            <dt className="text-muted">Total budget</dt>
            <dd>{formatMoney(c.totalBudgetMinor, c.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted">Spend cap</dt>
            <dd>{moneyOrDash(c.spendCapMinor, c.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted">Special category</dt>
            <dd>{c.specialCategory === "none" ? "None" : titleCase(c.specialCategory)}</dd>
          </div>
          {c.submittedAt ? (
            <div>
              <dt className="text-muted">Submitted</dt>
              <dd><LocalTime iso={c.submittedAt} /></dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <section aria-labelledby="adsets" className="space-y-4">
        <h2 id="adsets" className="font-medium">
          Ad sets and ads
        </h2>
        {c.adSets.length === 0 ? <p className="text-sm text-muted">No ad sets yet.</p> : null}
        {c.adSets.map((s) => (
          <Card key={s.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {s.name} <EntityBadge status={s.status} />
                </p>
                <p className="text-sm text-muted">{s.placements.map((pl) => PLACEMENT_LABELS[pl]).join(" · ")}</p>
                <p className="text-sm text-muted">{targetingSummary(s.targeting)}</p>
                <p className="text-xs text-muted">
                  {BID_STRATEGY_LABELS[s.bidStrategy]}
                  {s.bidMinor !== null ? ` · bid ${formatMoney(s.bidMinor, c.currency)}` : ""} · up to {s.frequencyCapPerDay} per member per day
                  {s.dailyBudgetMinor !== null ? ` · ${formatMoney(s.dailyBudgetMinor, c.currency)}/day` : ""}
                </p>
              </div>
              {canEdit && c.structure === "managed" ? <AdSetToggle set={s} currency={c.currency} /> : null}
            </div>
            {s.ads.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {s.ads.map((ad) => {
                  const creative = c.creatives.find((x) => x.id === ad.creativeId);
                  return (
                    <li key={ad.id} className="grid gap-4 p-4 md:grid-cols-[minmax(0,16rem)_1fr]">
                      {creative ? <AdPreview creative={creative} advertiser={account.displayName} placement="marketplace" /> : <div />}
                      <div className="flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{ad.name}</p>
                          <p className="flex flex-wrap gap-2">
                            <EntityBadge status={ad.status} />
                            <ReviewBadge status={ad.reviewStatus} />
                          </p>
                          {creative?.reviewNote ? <p className="text-sm text-muted">Reviewer: {creative.reviewNote}</p> : null}
                        </div>
                        {canEdit && c.structure === "managed" ? <AdControls ad={ad} campaignRunning={running} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">No ads in this ad set.</p>
            )}
          </Card>
        ))}
      </section>

      <section aria-labelledby="history" className="space-y-3">
        <h2 id="history" className="font-medium">
          Review history
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">No review decisions yet.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="panel flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.decision === "approved" || r.decision === "reinstated" ? "success" : r.decision === "changes_requested" ? "warning" : "danger"}>{titleCase(r.decision)}</Badge>
                    <span className="text-muted">
                      {titleCase(r.entityType)} · <LocalTime iso={r.createdAt} />
                    </span>
                  </p>
                  {r.reasons.length ? <p>{r.reasons.map(titleCase).join(", ")}</p> : null}
                  {r.note ? <p className="text-muted">{r.note}</p> : null}
                  {r.appeal ? (
                    <p className="text-muted">
                      Appeal: {titleCase(r.appeal.status)}
                      {r.appeal.resolutionNote ? ` — ${r.appeal.resolutionNote}` : ""}
                    </p>
                  ) : null}
                </div>
                {canEdit && !r.appeal && (r.decision === "rejected" || r.decision === "suspended" || r.decision === "changes_requested") ? <AppealButton reviewId={r.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
