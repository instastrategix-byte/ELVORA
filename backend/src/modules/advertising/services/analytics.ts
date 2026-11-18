import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import type { MetricRow, MetricsReport } from "../types";
import type { metricsQuerySchema } from "../validators";

/*
 * Metric definitions (all from recorded events in ad_events; nothing is estimated):
 *   impressions  sponsored items served and recorded by the delivery engine
 *   reach        distinct members who saw at least one impression (per row; not additive)
 *   frequency    impressions ÷ reach
 *   clicks       recorded clicks, at most one per impression
 *   CTR          clicks ÷ impressions
 *   spend        sum of delivery costs (CPM per impression or CPC per click), rounded up per row
 *   CPC / CPM    spend ÷ clicks, spend ÷ impressions × 1000
 *   conversions  attributed conversion events from the tracking module, when installed
 *   CVR / CPA    conversions ÷ clicks, spend ÷ conversions
 *   ROAS         conversion value ÷ spend
 * Conversions can't be attributed to placements, so placement rows show zero conversions.
 */

type Base = { impressions: number; clicks: number; spendMinor: number; conversions: number; conversionValueMinor: number };

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function derive<T extends Base>(r: T) {
  return {
    ...r,
    ctr: ratio(r.clicks, r.impressions),
    cpcMinor: ratio(r.spendMinor, r.clicks),
    cpmMinor: r.impressions > 0 ? (r.spendMinor / r.impressions) * 1000 : null,
    conversionRate: ratio(r.conversions, r.clicks),
    cpaMinor: ratio(r.spendMinor, r.conversions),
    roas: ratio(r.conversionValueMinor, r.spendMinor),
  };
}

function totalsOf(rows: Base[]) {
  return derive(
    rows.reduce<Base>(
      (t, r) => ({
        impressions: t.impressions + r.impressions,
        clicks: t.clicks + r.clicks,
        spendMinor: t.spendMinor + r.spendMinor,
        conversions: t.conversions + r.conversions,
        conversionValueMinor: t.conversionValueMinor + r.conversionValueMinor,
      }),
      { impressions: 0, clicks: 0, spendMinor: 0, conversions: 0, conversionValueMinor: 0 },
    ),
  );
}

async function fetchRows(db: DbClient, q: { accountId: string; from: string; to: string; group: string; campaignId?: string }): Promise<MetricRow[]> {
  const rows = unwrap(
    await db.rpc("ad_metrics", { p_account: q.accountId, p_from: q.from, p_to: q.to, p_group: q.group, p_campaign: q.campaignId ?? null }),
  );
  return rows.map((r) => {
    const base = derive({
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      spendMinor: Number(r.spend_minor),
      conversions: Number(r.conversions),
      conversionValueMinor: Number(r.conversion_value_minor),
    });
    const reach = Number(r.reach);
    return { key: r.key, label: r.label ?? r.key, reach, frequency: ratio(base.impressions, reach), ...base };
  });
}

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export async function getMetrics(db: DbClient, q: z.infer<typeof metricsQuerySchema>): Promise<MetricsReport> {
  const account = unwrap(await db.from("advertiser_accounts").select("currency").eq("id", q.accountId).maybeSingle());
  if (!account) throw new AppError("not_found", "Advertising account not found.");
  const rows = await fetchRows(db, q);
  let previous: MetricsReport["previous"] = null;
  if (q.compare === "previous") {
    const span = Math.round((Date.parse(q.to) - Date.parse(q.from)) / 86_400_000) + 1;
    const prev = await fetchRows(db, { ...q, from: shift(q.from, -span), to: shift(q.from, -1), group: "day" });
    previous = totalsOf(prev);
  }
  return { currency: account.currency, rows, totals: totalsOf(rows), previous };
}

/** CSV of a report (RFC 4180 quoting; formula-like cells are neutralised for spreadsheets). */
export function metricsToCsv(report: MetricsReport, groupLabel: string): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const money = (minor: number | null) => (minor === null ? null : (minor / 100).toFixed(2));
  const header = [groupLabel, "Impressions", "Reach", "Frequency", "Clicks", "CTR", `Spend (${report.currency})`, "CPC", "CPM", "Conversions", "CVR", "CPA", "ROAS"];
  const lines = report.rows.map((r) =>
    [
      r.label,
      r.impressions,
      r.reach,
      r.frequency === null ? null : r.frequency.toFixed(2),
      r.clicks,
      r.ctr === null ? null : (r.ctr * 100).toFixed(2) + "%",
      money(r.spendMinor),
      money(r.cpcMinor),
      money(r.cpmMinor),
      r.conversions,
      r.conversionRate === null ? null : (r.conversionRate * 100).toFixed(2) + "%",
      money(r.cpaMinor),
      r.roas === null ? null : r.roas.toFixed(2),
    ]
      .map(cell)
      .join(","),
  );
  return [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
