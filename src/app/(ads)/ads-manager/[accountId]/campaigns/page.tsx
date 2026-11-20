import { Megaphone, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatusBadge } from "@/components/ads-manager/badges";
import { CampaignActions } from "@/components/ads-manager/campaign-actions";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { campaignActionsFor, compactNumber, formatPercent, presetRange, roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import { OBJECTIVE_LABELS } from "@backend/modules/advertising/constants";
import { getMetrics, listCampaigns } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Campaigns" };

const STATUSES = ["draft", "pending_review", "active", "paused", "completed", "rejected"] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  draft: "Draft",
  pending_review: "In review",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  rejected: "Not approved",
};

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const { db, account } = await loadAdsPage(accountId, "campaigns");
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const archived = sp.archived === "1";
  const { from, to } = presetRange("30d");

  let data;
  try {
    const [campaigns, metrics] = await Promise.all([
      listCampaigns(db, accountId, { q, status: status || undefined, archived }),
      getMetrics(db, { accountId, from, to, group: "campaign", compare: "none" }),
    ]);
    data = { campaigns, metrics };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="your campaigns" />;
  }
  const metricBy = new Map(data.metrics.rows.map((r) => [r.key, r]));
  const base = `/ads-manager/${accountId}`;
  const canEdit = roleAtLeast(account.role, "editor");
  const filtered = Boolean(q || status || archived);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaigns"
        title="Campaigns"
        description="Each campaign is reviewed before it serves. Results show the last 30 days."
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

      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter campaigns">
        <label className="relative min-w-0 flex-1 sm:max-w-72">
          <span className="sr-only">Search campaigns</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input name="q" defaultValue={q} placeholder="Search by name" className="pl-9" />
        </label>
        <label>
          <span className="sr-only">Status</span>
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Show</span>
          <Select name="archived" defaultValue={archived ? "1" : ""}>
            <option value="">Current</option>
            <option value="1">Archived</option>
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href={`${base}/campaigns`}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {data.campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title={filtered ? "No campaigns match" : "No campaigns yet"}
          description={filtered ? "Try a different search or filter." : "Create a campaign, add an audience and a creative, then submit it for review."}
          action={
            !filtered && canEdit ? (
              <Button asChild>
                <Link href={`${base}/campaigns/new`}>Create campaign</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Campaigns with results for the last 30 days</caption>
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="p-4 font-medium">Campaign</th>
                <th scope="col" className="p-4 font-medium">Status</th>
                <th scope="col" className="p-4 font-medium">Budget</th>
                <th scope="col" className="p-4 font-medium">Schedule</th>
                <th scope="col" className="p-4 text-right font-medium">Spent</th>
                <th scope="col" className="p-4 text-right font-medium">Impr.</th>
                <th scope="col" className="p-4 text-right font-medium">CTR</th>
                <th scope="col" className="p-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.campaigns.map((c) => {
                const m = metricBy.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-surface-2/40">
                    <td className="p-4">
                      <Link href={`${base}/campaigns/${c.id}`} className="font-medium hover:text-accent">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {OBJECTIVE_LABELS[c.objective]}
                        {c.structure === "legacy" ? " · original format" : ""}
                      </span>
                    </td>
                    <td className="p-4">
                      <CampaignStatusBadge status={c.status} archived={Boolean(c.archivedAt)} suspended={Boolean(c.suspendedAt)} />
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {c.budgetType === "daily" ? (
                        <>
                          {formatMoney(c.dailyBudgetMinor, c.currency)}/day
                          <span className="block text-xs text-muted">{formatMoney(c.totalBudgetMinor, c.currency)} total</span>
                        </>
                      ) : (
                        <>
                          {formatMoney(c.totalBudgetMinor, c.currency)}
                          <span className="block text-xs text-muted">lifetime</span>
                        </>
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {formatDate(c.startsOn)} – {formatDate(c.endsOn)}
                    </td>
                    <td className="p-4 text-right tabular-nums">{formatMoney(m?.spendMinor ?? 0, c.currency)}</td>
                    <td className="p-4 text-right tabular-nums">{compactNumber(m?.impressions ?? 0)}</td>
                    <td className="p-4 text-right tabular-nums">{formatPercent(m?.ctr ?? null)}</td>
                    <td className="p-4 text-right">
                      <CampaignActions accountId={accountId} campaignId={c.id} actions={campaignActionsFor(c, account.role)} />
                    </td>
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
