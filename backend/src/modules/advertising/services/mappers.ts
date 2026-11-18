import type { AdObjective, AdPlacement, BidStrategy, CreativeFormat, Cta } from "../constants";
import type { AdSetView, AdView, CreativeView, ManagedCampaign, MediaItem } from "../types";

/* Row → view mappers shared by the services. Pure; no I/O. */

export const CAMPAIGN_COLUMNS =
  "id, advertiser_account_id, name, objective, status, structure, currency, budget_type, daily_budget_minor, total_budget_minor, spend_cap_minor, special_category, starts_on, ends_on, cpm_minor, cpc_minor, review_note, archived_at, suspended_at, submitted_at, created_at, updated_at";

type CampaignRow = {
  id: string;
  advertiser_account_id: string;
  name: string;
  objective: string;
  status: ManagedCampaign["status"];
  structure: string;
  currency: string;
  budget_type: string;
  daily_budget_minor: number;
  total_budget_minor: number;
  spend_cap_minor: number | null;
  special_category: string;
  starts_on: string;
  ends_on: string;
  cpm_minor: number | null;
  cpc_minor: number | null;
  review_note: string | null;
  archived_at: string | null;
  suspended_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function toCampaign(r: CampaignRow): ManagedCampaign {
  return {
    id: r.id,
    accountId: r.advertiser_account_id,
    name: r.name,
    objective: r.objective as AdObjective,
    status: r.status,
    structure: r.structure === "managed" ? "managed" : "legacy",
    currency: r.currency,
    budgetType: r.budget_type === "lifetime" ? "lifetime" : "daily",
    dailyBudgetMinor: Number(r.daily_budget_minor),
    totalBudgetMinor: Number(r.total_budget_minor),
    spendCapMinor: num(r.spend_cap_minor),
    specialCategory: r.special_category,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    cpmMinor: num(r.cpm_minor),
    cpcMinor: num(r.cpc_minor),
    reviewNote: r.review_note,
    archivedAt: r.archived_at,
    suspendedAt: r.suspended_at,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const AD_SET_COLUMNS =
  "id, campaign_id, account_id, name, status, placements, targeting, bid_strategy, bid_minor, daily_budget_minor, frequency_cap_per_day, starts_at, ends_at, created_at";

type AdSetRow = {
  id: string;
  campaign_id: string;
  account_id: string;
  name: string;
  status: AdSetView["status"];
  placements: string[];
  targeting: unknown;
  bid_strategy: string;
  bid_minor: number | null;
  daily_budget_minor: number | null;
  frequency_cap_per_day: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

export function toAdSet(r: AdSetRow): AdSetView {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    accountId: r.account_id,
    name: r.name,
    status: r.status,
    placements: r.placements as AdPlacement[],
    targeting: (r.targeting ?? {}) as AdSetView["targeting"],
    bidStrategy: r.bid_strategy as BidStrategy,
    bidMinor: num(r.bid_minor),
    dailyBudgetMinor: num(r.daily_budget_minor),
    frequencyCapPerDay: r.frequency_cap_per_day,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdAt: r.created_at,
  };
}

export const AD_COLUMNS = "id, ad_set_id, campaign_id, account_id, creative_id, name, status, review_status, created_at";

type AdRow = {
  id: string;
  ad_set_id: string;
  campaign_id: string;
  account_id: string;
  creative_id: string;
  name: string;
  status: AdView["status"];
  review_status: AdView["reviewStatus"];
  created_at: string;
};

export function toAd(r: AdRow): AdView {
  return {
    id: r.id,
    adSetId: r.ad_set_id,
    campaignId: r.campaign_id,
    accountId: r.account_id,
    creativeId: r.creative_id,
    name: r.name,
    status: r.status,
    reviewStatus: r.review_status,
    createdAt: r.created_at,
  };
}

export const CREATIVE_COLUMNS =
  "id, account_id, name, format, primary_text, headline, description, cta, destination_url, url_params, media, post_id, listing_id, event_id, business_id, review_status, review_note, created_at, updated_at";

type CreativeRow = {
  id: string;
  account_id: string;
  name: string;
  format: string;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string;
  destination_url: string | null;
  url_params: string | null;
  media: unknown;
  post_id: string | null;
  listing_id: string | null;
  event_id: string | null;
  business_id: string | null;
  review_status: CreativeView["reviewStatus"];
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

/** Storage media items are stored snake_case-free already (path, kind, width, height, durationS). */
export function mediaOf(value: unknown): MediaItem[] {
  return Array.isArray(value) ? (value as MediaItem[]) : [];
}

export function toCreative(r: CreativeRow, urls: Map<string, string | null> = new Map()): CreativeView {
  return {
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    format: r.format as CreativeFormat,
    primaryText: r.primary_text,
    headline: r.headline,
    description: r.description,
    cta: r.cta as Cta,
    destinationUrl: r.destination_url,
    urlParams: r.url_params,
    media: mediaOf(r.media).map((m) => ({ ...m, url: urls.get(m.path) ?? null })),
    postId: r.post_id,
    listingId: r.listing_id,
    eventId: r.event_id,
    businessId: r.business_id,
    reviewStatus: r.review_status,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
