import { z } from "zod";
import {
  AD_IMAGE_MAX_PX,
  AD_IMAGE_MIN_PX,
  AD_MEDIA_TYPES,
  AD_OBJECTIVES,
  AD_PLACEMENTS,
  AD_ROLES,
  AD_VIDEO_MAX_SECONDS,
  AUDIENCE_KINDS,
  BID_STRATEGIES,
  BUDGET_TYPES,
  CREATIVE_FORMATS,
  CTAS,
  SPECIAL_CATEGORIES,
} from "../constants";
import { targetingSchema } from "./targeting";

export { targetingSchema, compactTargeting, type Targeting } from "./targeting";

const money = z.number().positive().max(1e9);
const isoDate = z.iso.date({ error: "Use YYYY-MM-DD" });
const httpsUrl = z.url({ protocol: /^https$/, error: "Use a full https:// address" }).max(2000);
const urlParams = z
  .string()
  .trim()
  .max(500)
  .regex(/^[A-Za-z0-9_.~-]+=[A-Za-z0-9_.~%+-]*(&[A-Za-z0-9_.~-]+=[A-Za-z0-9_.~%+-]*){0,19}$/, {
    error: "Use key=value pairs joined by & (letters, numbers, _ . ~ - % +)",
  });

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------
export const accountSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  billingEmail: z.union([z.literal(""), z.email()]).transform((v) => (v === "" ? null : v)).nullable().optional(),
  spendLimit: money.nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const memberAddSchema = z.object({
  handle: z.string().trim().toLowerCase().transform((h) => h.replace(/^@/, "")).pipe(z.string().regex(/^[a-z0-9_]{3,30}$/)),
  role: z.enum(AD_ROLES).exclude(["owner"]),
});
export const memberRoleSchema = z.object({ role: z.enum(AD_ROLES).exclude(["owner"]) });

// ---------------------------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------------------------
const campaignFields = z.object({
  name: z.string().trim().min(3, { error: "Name is required" }).max(120),
  objective: z.enum(AD_OBJECTIVES),
  budgetType: z.enum(BUDGET_TYPES),
  dailyBudget: money.nullable().optional(),
  totalBudget: money.nullable().optional(),
  spendCap: money.nullable().optional(),
  startsOn: isoDate,
  endsOn: isoDate,
  specialCategory: z.enum(SPECIAL_CATEGORIES).default("none"),
});

function checkCampaign(c: z.infer<typeof campaignFields>, ctx: z.RefinementCtx) {
  if (c.endsOn < c.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "End date must be on or after the start date" });
  if (c.budgetType === "daily" && !c.dailyBudget) ctx.addIssue({ code: "custom", path: ["dailyBudget"], message: "Set a daily budget" });
  if (c.budgetType === "lifetime" && !c.totalBudget) ctx.addIssue({ code: "custom", path: ["totalBudget"], message: "Set a lifetime budget" });
  if (c.budgetType === "daily" && c.dailyBudget && c.totalBudget && c.totalBudget < c.dailyBudget) {
    ctx.addIssue({ code: "custom", path: ["totalBudget"], message: "The total must be at least the daily budget" });
  }
}

export const campaignCreateSchema = campaignFields.extend({ accountId: z.uuid() }).superRefine(checkCampaign);
export const campaignUpdateSchema = campaignFields.superRefine(checkCampaign);
export const campaignActionSchema = z.object({ action: z.enum(["submit", "pause", "resume", "archive", "unarchive", "duplicate"]) });

// ---------------------------------------------------------------------------------------------
// Ad sets
// ---------------------------------------------------------------------------------------------
const adSetFields = z.object({
  name: z.string().trim().min(3).max(120),
  placements: z.array(z.enum(AD_PLACEMENTS)).min(1, { error: "Choose at least one placement" }).max(AD_PLACEMENTS.length),
  targeting: targetingSchema.default({} as never),
  bidStrategy: z.enum(BID_STRATEGIES).default("lowest_cost"),
  bidAmount: money.nullable().optional(),
  dailyBudget: money.nullable().optional(),
  frequencyCapPerDay: z.number().int().min(1).max(20).default(3),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
function checkAdSet(s: z.infer<typeof adSetFields>, ctx: z.RefinementCtx) {
  if (s.bidStrategy !== "lowest_cost" && !s.bidAmount) ctx.addIssue({ code: "custom", path: ["bidAmount"], message: "Set a bid for this strategy" });
  if (s.startsAt && s.endsAt && s.endsAt <= s.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
}
export const adSetCreateSchema = adSetFields.extend({ campaignId: z.uuid() }).superRefine(checkAdSet);
export const adSetUpdateSchema = adSetFields.extend({ status: z.enum(["draft", "active", "paused", "archived"]).optional() }).superRefine(checkAdSet);

// ---------------------------------------------------------------------------------------------
// Creatives and media
// ---------------------------------------------------------------------------------------------
export const mediaItemSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/, { error: "Invalid media path" }),
  kind: z.enum(["image", "video"]),
  width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(),
  durationS: z.number().positive().max(3600).nullable().optional(),
});

const creativeFields = z.object({
  name: z.string().trim().min(1).max(120),
  format: z.enum(CREATIVE_FORMATS),
  primaryText: z.string().trim().max(500).optional().nullable(),
  headline: z.string().trim().max(90).optional().nullable(),
  description: z.string().trim().max(200).optional().nullable(),
  cta: z.enum(CTAS).default("learn_more"),
  destinationUrl: z.union([z.literal(""), httpsUrl]).transform((v) => (v === "" ? null : v)).nullable().optional(),
  urlParams: z.union([z.literal(""), urlParams]).transform((v) => (v === "" ? null : v)).nullable().optional(),
  media: z.array(mediaItemSchema).max(10).default([]),
  postId: z.uuid().nullable().optional(),
  listingId: z.uuid().nullable().optional(),
  eventId: z.uuid().nullable().optional(),
  businessId: z.uuid().nullable().optional(),
});

function checkCreative(c: z.infer<typeof creativeFields>, ctx: z.RefinementCtx) {
  const images = c.media.filter((m) => m.kind === "image").length;
  const videos = c.media.filter((m) => m.kind === "video").length;
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (c.format === "single_image" && (images !== 1 || videos)) issue("media", "Add exactly one image");
  if (c.format === "video" && (videos !== 1 || images)) issue("media", "Add exactly one video");
  if (c.format === "carousel" && (images < 2 || images > 10 || videos)) issue("media", "A carousel needs 2–10 images");
  if (c.format === "sponsored_post" && !c.postId) issue("postId", "Choose one of your posts");
  if (c.format === "business_card" && !c.businessId) issue("businessId", "Choose your business");
  if (c.format === "event" && !c.eventId) issue("eventId", "Choose one of your events");
  if (c.format !== "sponsored_post" && !c.headline) issue("headline", "Add a headline");
  if (!c.destinationUrl && !c.postId && !c.listingId && !c.eventId && !c.businessId) {
    issue("destinationUrl", "Add a destination link or choose something on ELVORA to promote");
  }
  for (const [i, m] of c.media.entries()) {
    if (m.kind === "image" && m.width && m.height) {
      if (Math.min(m.width, m.height) < AD_IMAGE_MIN_PX || Math.max(m.width, m.height) > AD_IMAGE_MAX_PX) {
        ctx.addIssue({ code: "custom", path: ["media", i], message: `Images must be ${AD_IMAGE_MIN_PX}–${AD_IMAGE_MAX_PX}px on each side` });
      }
    }
    if (m.kind === "video" && m.durationS && m.durationS > AD_VIDEO_MAX_SECONDS) {
      ctx.addIssue({ code: "custom", path: ["media", i], message: `Videos can be up to ${AD_VIDEO_MAX_SECONDS} seconds` });
    }
  }
}

export const creativeCreateSchema = creativeFields.extend({ accountId: z.uuid() }).superRefine(checkCreative);
export const creativeUpdateSchema = creativeFields.superRefine(checkCreative);

export const mediaUploadSchema = z
  .object({
    accountId: z.uuid(),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.string().max(100),
    size: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationS: z.number().positive().optional(),
  })
  .superRefine((f, ctx) => {
    const type = AD_MEDIA_TYPES[f.mimeType as keyof typeof AD_MEDIA_TYPES];
    if (!type) {
      ctx.addIssue({ code: "custom", path: ["mimeType"], message: "Use JPEG, PNG or WebP images, or MP4/WebM video" });
      return;
    }
    if (f.size > type.maxBytes) {
      ctx.addIssue({ code: "custom", path: ["size"], message: `Files of this type can be up to ${Math.round(type.maxBytes / 1024 / 1024)} MB` });
    }
    if (type.kind === "image" && f.width && f.height && (Math.min(f.width, f.height) < AD_IMAGE_MIN_PX || Math.max(f.width, f.height) > AD_IMAGE_MAX_PX)) {
      ctx.addIssue({ code: "custom", path: ["width"], message: `Images must be ${AD_IMAGE_MIN_PX}–${AD_IMAGE_MAX_PX}px on each side` });
    }
    if (type.kind === "video" && f.durationS && f.durationS > AD_VIDEO_MAX_SECONDS) {
      ctx.addIssue({ code: "custom", path: ["durationS"], message: `Videos can be up to ${AD_VIDEO_MAX_SECONDS} seconds` });
    }
  });

// ---------------------------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------------------------
export const adCreateSchema = z.object({ adSetId: z.uuid(), creativeId: z.uuid(), name: z.string().trim().min(1).max(120) });
export const adUpdateSchema = z.object({
  creativeId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

// ---------------------------------------------------------------------------------------------
// Audiences
// ---------------------------------------------------------------------------------------------
const engagementDefinition = z.object({ source: z.enum(["page_visitors", "ad_engagers"]), days: z.number().int().min(1).max(365) }).strict();
const savedDefinition = targetingSchema.refine((t) => t.include_audience_ids.length === 0 && t.exclude_audience_ids.length === 0, {
  error: "Saved audiences can't reference other audiences",
});

export const audienceCreateSchema = z
  .object({ accountId: z.uuid(), name: z.string().trim().min(1).max(120), kind: z.enum(AUDIENCE_KINDS), definition: z.unknown() })
  .transform((a, ctx) => {
    const parsed =
      a.kind === "engagement"
        ? engagementDefinition.safeParse(a.definition)
        : a.kind === "saved" || a.kind === "exclusion"
          ? savedDefinition.safeParse(a.definition ?? {})
          : { success: true as const, data: { requires_integration: true } };
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["definition", ...issue.path] } as never);
      return z.NEVER;
    }
    return { ...a, definition: parsed.data as Record<string, unknown> };
  });
export const audienceUpdateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), definition: z.unknown().optional() });
export const estimateSchema = z.object({ accountId: z.uuid().optional(), targeting: targetingSchema });

// ---------------------------------------------------------------------------------------------
// Analytics, reviews
// ---------------------------------------------------------------------------------------------
export const metricsQuerySchema = z
  .object({
    accountId: z.uuid(),
    from: isoDate,
    to: isoDate,
    group: z.enum(["day", "campaign", "ad_set", "ad", "placement"]).default("day"),
    campaignId: z.uuid().optional(),
    compare: z.enum(["previous", "none"]).default("none"),
  })
  .refine((q) => q.to >= q.from, { error: "End date must be after the start date", path: ["to"] });

export const REVIEW_REASONS = [
  "misleading_claims",
  "prohibited_product",
  "special_category_policy",
  "landing_page",
  "low_quality_creative",
  "trademark",
  "personal_attributes",
  "other",
] as const;
export const reviewDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    reasons: z.array(z.enum(REVIEW_REASONS)).max(10).default([]),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((r) => r.decision === "approved" || r.reasons.length > 0 || Boolean(r.note), {
    error: "Give the advertiser a reason",
    path: ["reasons"],
  });
export const suspensionSchema = z.object({
  suspend: z.boolean(),
  reasons: z.array(z.enum(REVIEW_REASONS)).max(10).default([]),
  note: z.string().trim().max(2000).optional(),
});
export const appealSchema = z.object({ message: z.string().trim().min(10).max(2000) });
export const resolveAppealSchema = z.object({ overturn: z.boolean(), note: z.string().trim().max(2000).optional() });
