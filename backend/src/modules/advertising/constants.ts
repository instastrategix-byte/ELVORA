/**
 * Ads Manager vocabulary. Client-safe (no server imports) so forms and the API share one source.
 * Every list here mirrors a CHECK constraint or enum in 20261122000100_ads_core.sql.
 */

export const AD_OBJECTIVES = [
  "awareness",
  "reach",
  "traffic",
  "engagement",
  "leads",
  "conversions",
  "event_promotion",
  "inquiries",
] as const;
export type AdObjective = (typeof AD_OBJECTIVES)[number];

export const OBJECTIVE_LABELS: Record<AdObjective, string> = {
  awareness: "Brand awareness",
  reach: "Reach",
  traffic: "Website traffic",
  engagement: "Engagement",
  leads: "Lead generation",
  conversions: "Conversions",
  event_promotion: "Event promotion",
  inquiries: "Marketplace enquiries",
};

export const AD_PLACEMENTS = ["feed", "stories", "discover", "marketplace", "events", "business", "recommendations"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  feed: "Home feed",
  stories: "Stories",
  discover: "Discover",
  marketplace: "Marketplace",
  events: "Events",
  business: "Business discovery",
  recommendations: "Sponsored recommendations",
};

export const BID_STRATEGIES = ["lowest_cost", "cpm_cap", "cpc_cap", "cpa_target"] as const;
export type BidStrategy = (typeof BID_STRATEGIES)[number];

export const BID_STRATEGY_LABELS: Record<BidStrategy, string> = {
  lowest_cost: "Lowest cost (CPM at the platform rate)",
  cpm_cap: "CPM bid cap",
  cpc_cap: "CPC bid cap (pay per click)",
  // Billed as CPM until conversion optimisation exists; see docs.
  cpa_target: "Cost per result target (billed CPM)",
};

export const BUDGET_TYPES = ["daily", "lifetime"] as const;
export const SPECIAL_CATEGORIES = ["none", "employment", "housing", "credit", "financial_products"] as const;

export const CREATIVE_FORMATS = ["single_image", "video", "carousel", "sponsored_post", "business_card", "event", "lead_form"] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export const FORMAT_LABELS: Record<CreativeFormat, string> = {
  single_image: "Single image",
  video: "Video",
  carousel: "Carousel",
  sponsored_post: "Sponsored post",
  business_card: "Sponsored business card",
  event: "Event promotion",
  lead_form: "Lead generation",
};

export const CTAS = ["learn_more", "shop_now", "book_now", "contact_us", "sign_up", "apply_now", "register", "get_quote", "download"] as const;
export type Cta = (typeof CTAS)[number];

export const CTA_LABELS: Record<Cta, string> = {
  learn_more: "Learn more",
  shop_now: "Shop now",
  book_now: "Book now",
  contact_us: "Contact us",
  sign_up: "Sign up",
  apply_now: "Apply now",
  register: "Register",
  get_quote: "Get a quote",
  download: "Download",
};

export const AD_ROLES = ["owner", "admin", "editor", "analyst"] as const;
export type AdRole = (typeof AD_ROLES)[number];
export const ROLE_RANK: Record<AdRole, number> = { owner: 4, admin: 3, editor: 2, analyst: 1 };

export const AUDIENCE_KINDS = ["saved", "engagement", "exclusion", "customer_list", "website"] as const;
export type AudienceKind = (typeof AUDIENCE_KINDS)[number];

/** Targeting keys members can be matched on. Sensitive characteristics are deliberately absent. */
export const TARGETING_KEYS = [
  "countries",
  "regions",
  "cities",
  "industries",
  "member_types",
  "job_titles",
  "business_types",
  "interests",
  "languages",
  "include_audience_ids",
  "exclude_audience_ids",
] as const;

/** Smallest audience ELVORA will report a size for. */
export const MIN_AUDIENCE_SIZE = 100;

export const AD_MEDIA_BUCKET = "ad-media";
export const AD_MEDIA_TYPES = {
  "image/jpeg": { kind: "image", ext: "jpg", maxBytes: 10 * 1024 * 1024 },
  "image/png": { kind: "image", ext: "png", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { kind: "image", ext: "webp", maxBytes: 10 * 1024 * 1024 },
  "video/mp4": { kind: "video", ext: "mp4", maxBytes: 100 * 1024 * 1024 },
  "video/webm": { kind: "video", ext: "webm", maxBytes: 100 * 1024 * 1024 },
} as const;
export type AdMediaType = keyof typeof AD_MEDIA_TYPES;
export const AD_IMAGE_MIN_PX = 400;
export const AD_IMAGE_MAX_PX = 8000;
export const AD_VIDEO_MAX_SECONDS = 120;
