"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Alert, Card, Spinner } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { MetricRow, MetricsReport } from "@backend/modules/advertising/types";
import { BarList, StatTile, TimeSeriesChart } from "./charts";
import {
  CHART_METRICS,
  compactNumber,
  dailySeries,
  formatMetric,
  formatPercent,
  formatRoas,
  METRIC_LABELS,
  moneyOrDash,
  presetRange,
  RANGE_PRESETS,
  type ChartMetric,
  type RangePreset,
} from "./model";

export const GROUPS = [
  { id: "day", label: "Day" },
  { id: "campaign", label: "Campaign" },
  { id: "ad_set", label: "Ad set" },
  { id: "ad", label: "Ad" },
  { id: "placement", label: "Placement" },
] as const;
export type Group = (typeof GROUPS)[number]["id"];

export type ReportQuery = { from: string; to: string; group: Group; campaignId: string; compare: boolean };

export function reportQueryString(accountId: string, q: ReportQuery): string {
  const p = new URLSearchParams({ accountId, from: q.from, to: q.to, group: q.group, compare: q.compare ? "previous" : "none" });
  if (q.campaignId) p.set("campaignId", q.campaignId);
  return p.toString();
}

/** Fetches a measured report; keeps the previous result on screen while refetching. */
export function useReport(accountId: string, q: ReportQuery) {
  const [report, setReport] = useState<MetricsReport | null>(null);
  // The query the current result (or error) belongs to; anything else means a fetch is in flight.
  const [settled, setSettled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qs = reportQueryString(accountId, q);
  useEffect(() => {
    const controller = new AbortController();
    api<MetricsReport>(`/api/v1/ads-manager/analytics?${qs}`, { signal: controller.signal })
      .then((r) => {
        setReport(r);
        setError(null);
        setSettled(qs);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(errorMessage(e));
        setSettled(qs);
      });
    return () => controller.abort();
  }, [qs]);
  return { report, loading: settled !== qs, error, qs };
}

export function ReportFilters({
  q,
  onChange,
  campaigns,
  groups = GROUPS,
}: {
  q: ReportQuery & { preset: RangePreset | "custom" };
  onChange: (next: ReportQuery & { preset: RangePreset | "custom" }) => void;
  campaigns: { id: string; name: string }[];
  groups?: readonly { id: Group; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Report filters">
      <label className="space-y-1 text-xs text-muted">
        <span className="block">Date range</span>
        <Select
          value={q.preset}
          onChange={(e) => {
            const preset = e.target.value as RangePreset | "custom";
            onChange(preset === "custom" ? { ...q, preset } : { ...q, preset, ...presetRange(preset) });
          }}
        >
          {RANGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom range</option>
        </Select>
      </label>
      {q.preset === "custom" ? (
        <>
          <label className="space-y-1 text-xs text-muted">
            <span className="block">From</span>
            <Input type="date" value={q.from} max={q.to} onChange={(e) => e.target.value && onChange({ ...q, from: e.target.value })} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span className="block">To</span>
            <Input type="date" value={q.to} min={q.from} onChange={(e) => e.target.value && onChange({ ...q, to: e.target.value })} />
          </label>
        </>
      ) : null}
      <label className="space-y-1 text-xs text-muted">
        <span className="block">Break down by</span>
        <Select value={q.group} onChange={(e) => onChange({ ...q, group: e.target.value as Group })}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1 text-xs text-muted">
        <span className="block">Campaign</span>
        <Select value={q.campaignId} onChange={(e) => onChange({ ...q, campaignId: e.target.value })}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex h-10 items-center gap-2 text-sm">
        <Checkbox checked={q.compare} onChange={(e) => onChange({ ...q, compare: e.target.checked })} />
        Compare with previous period
      </label>
    </div>
  );
}

export const TABLE_COLUMNS: { key: keyof MetricRow; label: string; format: (r: MetricRow, currency: string) => string }[] = [
  { key: "impressions", label: "Impressions", format: (r) => compactNumber(r.impressions) },
  { key: "reach", label: "Reach", format: (r) => compactNumber(r.reach) },
  { key: "frequency", label: "Frequency", format: (r) => (r.frequency === null ? "—" : r.frequency.toFixed(2)) },
  { key: "clicks", label: "Clicks", format: (r) => compactNumber(r.clicks) },
  { key: "ctr", label: "CTR", format: (r) => formatPercent(r.ctr) },
  { key: "spendMinor", label: "Spent", format: (r, c) => moneyOrDash(r.spendMinor, c) },
  { key: "cpcMinor", label: "CPC", format: (r, c) => moneyOrDash(r.cpcMinor, c) },
  { key: "cpmMinor", label: "CPM", format: (r, c) => moneyOrDash(r.cpmMinor, c) },
  { key: "conversions", label: "Conversions", format: (r) => compactNumber(r.conversions) },
  { key: "conversionRate", label: "Conv. rate", format: (r) => formatPercent(r.conversionRate) },
  { key: "cpaMinor", label: "Cost / result", format: (r, c) => moneyOrDash(r.cpaMinor, c) },
  { key: "roas", label: "ROAS", format: (r) => formatRoas(r.roas) },
];

export function MetricsTable({ report, group, columns = TABLE_COLUMNS }: { report: MetricsReport; group: Group; columns?: typeof TABLE_COLUMNS }) {
  const label = GROUPS.find((g) => g.id === group)?.label ?? "Row";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Results by {label.toLowerCase()}</caption>
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="p-3 font-medium">
              {label}
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="p-3 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {report.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="max-w-64 truncate p-3 text-left font-normal">
                {r.label}
              </th>
              {columns.map((c) => (
                <td key={c.key} className="p-3 text-right">
                  {c.format(r, report.currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsView({ accountId, campaigns }: { accountId: string; campaigns: { id: string; name: string }[] }) {
  const [q, setQ] = useState<ReportQuery & { preset: RangePreset | "custom" }>(() => ({ preset: "30d", ...presetRange("30d"), group: "day", campaignId: "", compare: true }));
  const [metric, setMetric] = useState<ChartMetric>("spendMinor");
  const { report, loading, error, qs } = useReport(accountId, q);
  const cur = report?.currency ?? "USD";
  const t = report?.totals;
  const p = report?.previous ?? undefined;
  const empty = report && report.rows.length === 0;

  const bars = useMemo(() => {
    if (!report || q.group === "day") return [];
    return [...report.rows]
      .map((r) => ({ key: r.key, label: r.label, value: (r[metric] as number | null) ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [report, q.group, metric]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ReportFilters q={q} onChange={setQ} campaigns={campaigns} />
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/v1/ads-manager/analytics/export?${qs}`} download>
            <Download /> Export CSV
          </a>
        </Button>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!report && loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading results" />
        </div>
      ) : null}
      {report && t ? (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Amount spent" value={formatMetric("spendMinor", t.spendMinor, cur)} current={t.spendMinor} previous={q.compare ? (p?.spendMinor ?? null) : undefined} upIsGood={false} />
            <StatTile label="Impressions" value={compactNumber(t.impressions)} current={t.impressions} previous={q.compare ? (p?.impressions ?? null) : undefined} />
            <StatTile label="Clicks" value={compactNumber(t.clicks)} current={t.clicks} previous={q.compare ? (p?.clicks ?? null) : undefined} />
            <StatTile label="Click-through rate" value={formatPercent(t.ctr)} current={t.ctr} previous={q.compare ? (p?.ctr ?? null) : undefined} />
            <StatTile label="Conversions" value={compactNumber(t.conversions)} current={t.conversions} previous={q.compare ? (p?.conversions ?? null) : undefined} />
            <StatTile label="Cost per result" value={moneyOrDash(t.cpaMinor, cur)} current={t.cpaMinor} previous={q.compare ? (p?.cpaMinor ?? null) : undefined} upIsGood={false} />
            <StatTile label="Cost per click" value={moneyOrDash(t.cpcMinor, cur)} current={t.cpcMinor} previous={q.compare ? (p?.cpcMinor ?? null) : undefined} upIsGood={false} />
            <StatTile label="Return on ad spend" value={formatRoas(t.roas)} current={t.roas} previous={q.compare ? (p?.roas ?? null) : undefined} />
          </div>

          {empty ? (
            <Card className="p-8 text-center text-sm text-muted">No delivery in this period. Results appear once an approved campaign serves.</Card>
          ) : (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium">
                  {METRIC_LABELS[metric]} by {GROUPS.find((g) => g.id === q.group)?.label.toLowerCase()}
                </h2>
                <label className="text-sm">
                  <span className="sr-only">Metric</span>
                  <Select value={metric} onChange={(e) => setMetric(e.target.value as ChartMetric)}>
                    {CHART_METRICS.map((m) => (
                      <option key={m} value={m}>
                        {METRIC_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {q.group === "day" ? (
                <TimeSeriesChart
                  title={`${METRIC_LABELS[metric]} per day`}
                  points={dailySeries(report.rows, q.from, q.to, metric)}
                  format={(v) => formatMetric(metric, v, cur)}
                  formatTick={(v) => (metric === "ctr" ? `${(v * 100).toFixed(1)}%` : formatMetric(metric, v, cur))}
                />
              ) : (
                <BarList title={`${METRIC_LABELS[metric]} by ${q.group}`} items={bars} format={(v) => formatMetric(metric, v, cur)} />
              )}
              {q.group === "placement" ? <p className="text-xs text-muted">Conversions can&apos;t be attributed to placements, so placement rows show zero conversions.</p> : null}
            </Card>
          )}

          {!empty ? (
            <Card className="p-2">
              <MetricsTable report={report} group={q.group} />
            </Card>
          ) : null}
          <p className="text-xs text-muted">
            All figures come from recorded impressions, clicks and attributed conversions, in UTC days. Reach is distinct members per row and doesn&apos;t add up across rows.
          </p>
        </div>
      ) : null}
    </div>
  );
}
