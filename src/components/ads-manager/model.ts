/**
 * Ads Manager view-model helpers. Pure and client-safe, so pages, client components and unit
 * tests share one definition of how numbers, ranges and permitted actions are worked out.
 */
import { formatMoney } from "@/lib/format";
import {
  AD_IMAGE_MAX_PX,
  AD_IMAGE_MIN_PX,
  AD_MEDIA_TYPES,
  AD_VIDEO_MAX_SECONDS,
  ROLE_RANK,
  type AdRole,
} from "@backend/modules/advertising/constants";
import type { CampaignStatus } from "@backend/modules/advertising/types";

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function minorToMajor(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency) ? minor : minor / 100;
}

export function majorToMinor(major: number, currency: string): number {
  return Math.round(major * (ZERO_DECIMAL.has(currency) ? 1 : 100));
}

/** 1,284 · 12.9K · 4.2M — full under 10,000, compact above. */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 10_000) return new Intl.NumberFormat("en").format(Math.round(n));
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatPercent(ratio: number | null, digits = 2): string {
  return ratio === null ? "—" : `${(ratio * 100).toFixed(digits)}%`;
}

export function formatRoas(roas: number | null): string {
  return roas === null ? "—" : `${roas.toFixed(2)}×`;
}

export function moneyOrDash(minor: number | null, currency: string): string {
  return minor === null ? "—" : formatMoney(Math.round(minor), currency);
}

/** Change vs the previous period. Null when there's nothing to compare against. */
export function periodDelta(current: number | null, previous: number | null): { ratio: number; direction: "up" | "down" | "flat" } | null {
  if (current === null || previous === null || previous === 0) return null;
  const ratio = (current - previous) / Math.abs(previous);
  return { ratio, direction: Math.abs(ratio) < 0.0005 ? "flat" : ratio > 0 ? "up" : "down" };
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];

/** Inclusive UTC date range ending today. */
export function presetRange(preset: RangePreset, today: Date = new Date()): { from: string; to: string } {
  const days = RANGE_PRESETS.find((p) => p.id === preset)?.days ?? 30;
  const to = isoDay(today);
  const from = isoDay(new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000));
  return { from, to };
}

/** Every day in [from, to] so a time series has no silent gaps (missing days are real zeros). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 400; t += 86_400_000) out.push(isoDay(new Date(t)));
  return out;
}

export function roleAtLeast(role: AdRole | null | undefined, min: AdRole): boolean {
  return Boolean(role && ROLE_RANK[role] >= ROLE_RANK[min]);
}

export type CampaignAction = "submit" | "pause" | "resume" | "archive" | "unarchive" | "duplicate";

/** Actions the UI offers for a campaign. The database enforces the same rules again. */
export function campaignActionsFor(
  c: { status: CampaignStatus; archivedAt: string | null; suspendedAt: string | null; structure: "legacy" | "managed" },
  role: AdRole | null,
): CampaignAction[] {
  if (!roleAtLeast(role, "editor")) return [];
  if (c.archivedAt) return ["unarchive", "duplicate"];
  const out: CampaignAction[] = [];
  if (c.structure === "managed" && (c.status === "draft" || c.status === "rejected")) out.push("submit");
  if (!c.suspendedAt) {
    if (c.status === "active") out.push("pause");
    if (c.status === "paused") out.push("resume");
  }
  out.push("duplicate");
  if (c.status !== "pending_review") out.push("archive");
  return out;
}

export const CAMPAIGN_ACTION_LABELS: Record<CampaignAction, string> = {
  submit: "Submit for review",
  pause: "Pause",
  resume: "Resume",
  archive: "Archive",
  unarchive: "Restore",
  duplicate: "Duplicate",
};

/** Audience size copy. The server returns null below its privacy floor; never show a fake number. */
export function audienceSizeLabel(estimate: number | null | undefined, floor = 100): string {
  if (estimate === undefined) return "—";
  if (estimate === null) return `Fewer than ${floor} members`;
  return `About ${compactNumber(estimate)} members`;
}

/** Splits a comma/newline-separated list of free-text targeting terms. */
export function parseTerms(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const t = raw.trim().slice(0, 80);
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out.slice(0, 50);
}

type MetricValues = {
  impressions: number;
  clicks: number;
  spendMinor: number;
  conversions: number;
  conversionValueMinor: number;
  ctr: number | null;
  cpcMinor: number | null;
  cpmMinor: number | null;
  cpaMinor: number | null;
  roas: number | null;
  conversionRate: number | null;
};

export const CHART_METRICS = ["spendMinor", "impressions", "clicks", "ctr", "conversions", "cpcMinor"] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

export const METRIC_LABELS: Record<ChartMetric, string> = {
  spendMinor: "Spend",
  impressions: "Impressions",
  clicks: "Clicks",
  ctr: "Click-through rate",
  conversions: "Conversions",
  cpcMinor: "Cost per click",
};

export function formatMetric(metric: ChartMetric, value: number | null, currency: string): string {
  if (value === null) return "—";
  switch (metric) {
    case "spendMinor":
    case "cpcMinor":
      return formatMoney(Math.round(value), currency);
    case "ctr":
      return formatPercent(value);
    default:
      return compactNumber(value);
  }
}

/** Day-by-day series for one metric; days with no delivery are real zeros (ratios stay null → 0 on the chart). */
export function dailySeries(rows: ({ key: string } & MetricValues)[], from: string, to: string, metric: ChartMetric): { date: string; value: number }[] {
  const byDay = new Map(rows.map((r) => [r.key, r]));
  return eachDay(from, to).map((date) => ({ date, value: byDay.get(date)?.[metric] ?? 0 }));
}

/**
 * Client-side media check before asking for an upload URL — the same limits the server applies,
 * checked early so people get the message before a large upload starts.
 */
export function checkAdMedia(f: { mimeType: string; size: number; width?: number | null; height?: number | null; durationS?: number | null }): string | null {
  const type = AD_MEDIA_TYPES[f.mimeType as keyof typeof AD_MEDIA_TYPES];
  if (!type) return "Use JPEG, PNG or WebP images, or MP4/WebM video.";
  if (f.size > type.maxBytes) return `Files of this type can be up to ${Math.round(type.maxBytes / 1024 / 1024)} MB.`;
  if (type.kind === "image" && f.width && f.height) {
    if (Math.min(f.width, f.height) < AD_IMAGE_MIN_PX || Math.max(f.width, f.height) > AD_IMAGE_MAX_PX) {
      return `Images must be ${AD_IMAGE_MIN_PX}–${AD_IMAGE_MAX_PX}px on each side (this one is ${f.width}×${f.height}).`;
    }
  }
  if (type.kind === "video" && f.durationS && f.durationS > AD_VIDEO_MAX_SECONDS) {
    return `Videos can be up to ${AD_VIDEO_MAX_SECONDS} seconds (this one is ${Math.round(f.durationS)}s).`;
  }
  return null;
}

/** A clean axis step (1, 2, 2.5, 5 × 10ⁿ) giving about `ticks` gridlines up to `max`. */
export function niceStep(max: number, ticks = 4): number {
  if (!(max > 0)) return 1;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

export function maskTail(value: string, visible = 6): string {
  return value.length <= visible ? value : `…${value.slice(-visible)}`;
}
