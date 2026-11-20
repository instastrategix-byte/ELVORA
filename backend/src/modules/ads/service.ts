import "server-only";
import type { Database } from "@backend/db/database.types";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { isSafeDestination } from "@/lib/safe-url";
import { toMinorUnits } from "@/lib/format";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { advertiserAccountSchema, campaignSchema } from "./schemas";

export type CampaignStatus = "draft" | "pending_review" | "active" | "paused" | "completed" | "rejected";

export type AdvertiserAccount = { id: string; displayName: string; billingEmail: string | null; status: "active" | "suspended" };

export type CampaignView = {
  id: string;
  name: string;
  objective: Database["public"]["Enums"]["campaign_objective"];
  status: CampaignStatus;
  currency: string;
  dailyBudgetMinor: number;
  totalBudgetMinor: number;
  startsOn: string;
  endsOn: string;
  headline: string;
  body: string | null;
  destinationUrl: string | null;
  listingId: string | null;
  targetLocations: string[];
  targetInterests: string[];
  frequencyCapPerDay: number;
  cpmMinor: number | null;
  cpcMinor: number | null;
  reviewNote: string | null;
  createdAt: string;
};

/** Measured metrics only — derived from recorded ad_events. No estimates are mixed in. */
export type CampaignReport = {
  days: { day: string; impressions: number; clicks: number; spendMinor: number }[];
  totals: { impressions: number; clicks: number; spendMinor: number; ctr: number | null };
};

export type SponsoredItem = {
  impressionId: string;
  campaignId: string;
  headline: string;
  body: string | null;
  advertiserName: string;
  hasDestination: boolean;
};

type CampaignRow = {
  id: string;
  name: string;
  objective: CampaignView["objective"];
  status: CampaignStatus;
  currency: string;
  daily_budget_minor: number;
  total_budget_minor: number;
  starts_on: string;
  ends_on: string;
  headline: string | null;
  body: string | null;
  destination_url: string | null;
  listing_id: string | null;
  target_locations: string[];
  target_interests: string[];
  frequency_cap_per_day: number;
  cpm_minor: number | null;
  cpc_minor: number | null;
  review_note: string | null;
  created_at: string;
};

export function toCampaignView(r: CampaignRow): CampaignView {
  return {
    id: r.id,
    name: r.name,
    objective: r.objective,
    status: r.status,
    currency: r.currency,
    dailyBudgetMinor: r.daily_budget_minor,
    totalBudgetMinor: r.total_budget_minor,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    // Ads Manager campaigns keep their copy on ads, not the campaign.
    headline: r.headline ?? r.name,
    body: r.body,
    destinationUrl: r.destination_url,
    listingId: r.listing_id,
    targetLocations: r.target_locations,
    targetInterests: r.target_interests,
    frequencyCapPerDay: r.frequency_cap_per_day,
    cpmMinor: r.cpm_minor,
    cpcMinor: r.cpc_minor,
    reviewNote: r.review_note,
    createdAt: r.created_at,
  };
}

export async function getAdvertiserAccount(db: DbClient, viewer: Viewer): Promise<AdvertiserAccount | null> {
  const row = unwrap(await db.from("advertiser_accounts").select("*").eq("owner_id", viewer.id).maybeSingle());
  return row ? { id: row.id, displayName: row.display_name, billingEmail: row.billing_email, status: row.status } : null;
}

export async function saveAdvertiserAccount(db: DbClient, viewer: Viewer, input: z.infer<typeof advertiserAccountSchema>): Promise<AdvertiserAccount> {
  const existing = await getAdvertiserAccount(db, viewer);
  const fields = { display_name: input.displayName, billing_email: input.billingEmail ?? null };
  const result = existing
    ? await db.from("advertiser_accounts").update(fields).eq("id", existing.id).select("*").single()
    : await db.from("advertiser_accounts").insert({ ...fields, owner_id: viewer.id }).select("*").single();
  if (result.error?.code === "42501") throw new AppError("forbidden", "An Advertiser membership is required.");
  const row = unwrap(result);
  return { id: row.id, displayName: row.display_name, billingEmail: row.billing_email, status: row.status };
}

export async function listRateCards(db: DbClient) {
  return unwrap(await db.from("ad_rate_cards").select("currency, objective, cpm_minor, cpc_minor").eq("active", true).order("currency"));
}

export async function listCampaigns(db: DbClient, viewer: Viewer): Promise<CampaignView[]> {
  const rows = unwrap(
    await db.from("ad_campaigns").select("*").eq("owner_id", viewer.id).order("created_at", { ascending: false }).limit(100),
  );
  return rows.map(toCampaignView);
}

export async function getCampaign(db: DbClient, id: string): Promise<CampaignView | null> {
  const row = unwrap(await db.from("ad_campaigns").select("*").eq("id", id).maybeSingle());
  return row ? toCampaignView(row) : null;
}

function campaignFields(input: z.infer<typeof campaignSchema>) {
  return {
    name: input.name,
    objective: input.objective,
    currency: input.currency,
    daily_budget_minor: toMinorUnits(input.dailyBudget, input.currency),
    total_budget_minor: toMinorUnits(input.totalBudget, input.currency),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    headline: input.headline,
    body: input.body ?? null,
    destination_url: input.destinationUrl ?? null,
    listing_id: input.listingId ?? null,
    target_locations: input.targetLocations,
    target_interests: input.targetInterests,
    frequency_cap_per_day: input.frequencyCapPerDay,
  };
}

export async function createCampaign(db: DbClient, viewer: Viewer, input: z.infer<typeof campaignSchema>): Promise<{ id: string }> {
  const account = await getAdvertiserAccount(db, viewer);
  if (!account) throw new AppError("business_rule", "Set up your advertiser account first.");
  const { data, error } = await db
    .from("ad_campaigns")
    .insert({ ...campaignFields(input), advertiser_account_id: account.id, owner_id: viewer.id })
    .select("id")
    .single();
  if (error?.code === "42501") throw new AppError("forbidden", "Campaigns require an active Advertiser membership and account.");
  throwIfError(error);
  return data!;
}

export async function updateCampaign(db: DbClient, id: string, input: z.infer<typeof campaignSchema>) {
  const rows = unwrap(await db.from("ad_campaigns").update(campaignFields(input)).eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("business_rule", "Only draft or rejected campaigns can be edited.");
}

export async function deleteCampaign(db: DbClient, id: string) {
  const rows = unwrap(await db.from("ad_campaigns").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("business_rule", "Only draft or rejected campaigns can be deleted.");
}

export async function transitionCampaign(db: DbClient, id: string, action: string, note?: string): Promise<CampaignStatus> {
  return unwrap(await db.rpc("transition_campaign", { p_id: id, p_action: action, p_note: note }));
}

export async function getCampaignReport(db: DbClient, id: string): Promise<CampaignReport> {
  const rows = unwrap(await db.rpc("campaign_report", { p_campaign: id }));
  const days = rows.map((r) => ({
    day: r.day ?? "",
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    spendMinor: Number(r.spend_minor ?? 0),
  }));
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  return {
    days,
    totals: {
      impressions,
      clicks,
      spendMinor: days.reduce((s, d) => s + d.spendMinor, 0),
      ctr: impressions > 0 ? clicks / impressions : null,
    },
  };
}

/** Selects sponsored items for the viewer; each returned item is a recorded impression. */
export async function serveAds(db: DbClient, placement: "feed" | "luxury" | "discover"): Promise<SponsoredItem[]> {
  const rows = unwrap(await db.rpc("serve_ads", { p_placement: placement, p_limit: 1 }));
  return rows.map((r) => ({
    impressionId: r.impression_id!,
    campaignId: r.campaign_id!,
    headline: r.headline ?? "",
    body: r.body,
    advertiserName: r.advertiser_name ?? "Sponsor",
    hasDestination: Boolean(r.destination_url || r.listing_id),
  }));
}

/** Records a click and resolves the destination server-side (no open redirect from client input). */
export async function recordClick(db: DbClient, impressionId: string): Promise<{ url: string }> {
  const rows = unwrap(await db.rpc("record_ad_click", { p_impression: impressionId }));
  const row = rows[0];
  if (row?.destination_url) {
    if (isSafeDestination(row.destination_url)) return { url: row.destination_url };
    throw new AppError("not_found", "This sponsored item has no valid destination.");
  }
  if (row?.listing_id) {
    const listing = unwrap(await db.from("listings").select("slug").eq("id", row.listing_id).maybeSingle());
    if (listing) return { url: `/luxury/${listing.slug}` };
  }
  throw new AppError("not_found", "This sponsored item is no longer available.");
}
