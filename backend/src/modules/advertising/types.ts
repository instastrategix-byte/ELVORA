import type { AdObjective, AdPlacement, AdRole, AudienceKind, BidStrategy, CreativeFormat, Cta } from "./constants";
import type { Targeting } from "./validators/targeting";

export type EntityStatus = "draft" | "active" | "paused" | "archived";
export type ReviewStatus = "draft" | "pending" | "approved" | "rejected" | "changes_requested";
export type CampaignStatus = "draft" | "pending_review" | "active" | "paused" | "completed" | "rejected";

export type AdAccount = {
  id: string;
  displayName: string;
  billingEmail: string | null;
  currency: string;
  balanceMinor: number;
  spendLimitMinor: number | null;
  billingStatus: "ok" | "payment_failed" | "suspended";
  billingMode: "prepaid" | "subscription";
  status: "active" | "suspended";
  timezone: string;
  role: AdRole | null;
};

export type AdAccountMember = {
  userId: string;
  role: AdRole;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type ManagedCampaign = {
  id: string;
  accountId: string;
  name: string;
  objective: AdObjective;
  status: CampaignStatus;
  structure: "legacy" | "managed";
  currency: string;
  budgetType: "daily" | "lifetime";
  dailyBudgetMinor: number;
  totalBudgetMinor: number;
  spendCapMinor: number | null;
  specialCategory: string;
  startsOn: string;
  endsOn: string;
  cpmMinor: number | null;
  cpcMinor: number | null;
  reviewNote: string | null;
  archivedAt: string | null;
  suspendedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdSetView = {
  id: string;
  campaignId: string;
  accountId: string;
  name: string;
  status: EntityStatus;
  placements: AdPlacement[];
  targeting: Partial<Targeting>;
  bidStrategy: BidStrategy;
  bidMinor: number | null;
  dailyBudgetMinor: number | null;
  frequencyCapPerDay: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

export type MediaItem = { path: string; kind: "image" | "video"; width?: number | null; height?: number | null; durationS?: number | null };

export type CreativeView = {
  id: string;
  accountId: string;
  name: string;
  format: CreativeFormat;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  cta: Cta;
  destinationUrl: string | null;
  urlParams: string | null;
  media: (MediaItem & { url: string | null })[];
  postId: string | null;
  listingId: string | null;
  eventId: string | null;
  businessId: string | null;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdView = {
  id: string;
  adSetId: string;
  campaignId: string;
  accountId: string;
  creativeId: string;
  name: string;
  status: EntityStatus;
  reviewStatus: ReviewStatus;
  createdAt: string;
};

export type CampaignDetail = ManagedCampaign & { adSets: (AdSetView & { ads: AdView[] })[]; creatives: CreativeView[] };

export type AudienceView = {
  id: string;
  accountId: string;
  name: string;
  kind: AudienceKind;
  definition: Record<string, unknown>;
  version: number;
  requiresIntegration: boolean;
  updatedAt: string;
};

export type ReviewView = {
  id: string;
  entityType: "campaign" | "ad" | "creative" | "account";
  entityId: string;
  accountId: string;
  decision: "approved" | "rejected" | "changes_requested" | "suspended" | "reinstated";
  reasons: string[];
  note: string | null;
  createdAt: string;
  appeal: { id: string; status: "open" | "upheld" | "overturned"; resolutionNote: string | null } | null;
};

/** Measured delivery for one row of a report. Derived ratios are null when undefined (÷0). */
export type MetricRow = {
  key: string;
  label: string;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  ctr: number | null;
  spendMinor: number;
  cpcMinor: number | null;
  cpmMinor: number | null;
  conversions: number;
  conversionRate: number | null;
  cpaMinor: number | null;
  conversionValueMinor: number;
  roas: number | null;
};

export type MetricsReport = {
  currency: string;
  rows: MetricRow[];
  totals: Omit<MetricRow, "key" | "label" | "reach" | "frequency">;
  previous: Omit<MetricRow, "key" | "label" | "reach" | "frequency"> | null;
};

export type SponsoredAd = {
  impressionId: string;
  adId: string | null;
  campaignId: string;
  format: CreativeFormat | "text";
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  cta: Cta;
  media: { kind: "image" | "video"; url: string | null; width?: number | null; height?: number | null }[];
  advertiserName: string;
  hasDestination: boolean;
};
