/**
 * Campaign wizard state. Pure, so the step rules are unit-tested and the same Zod schemas the
 * API uses decide whether a step is complete. Nothing here talks to the network.
 */
import type { AdObjective, AdPlacement, BidStrategy, CreativeFormat, Cta } from "@backend/modules/advertising/constants";
import type { CampaignDetail } from "@backend/modules/advertising/types";
import {
  adSetUpdateSchema,
  campaignUpdateSchema,
  creativeUpdateSchema,
  type Targeting,
} from "@backend/modules/advertising/validators";
import { isoDay, minorToMajor } from "./model";

export const WIZARD_STEPS = [
  { id: "objective", label: "Objective" },
  { id: "budget", label: "Budget & schedule" },
  { id: "audience", label: "Audience" },
  { id: "placements", label: "Placements" },
  { id: "bidding", label: "Bidding" },
  { id: "creative", label: "Creative" },
  { id: "review", label: "Review" },
] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export type TargetingDraft = Omit<Targeting, "languages">;

export const EMPTY_TARGETING: TargetingDraft = {
  countries: [],
  regions: [],
  cities: [],
  industries: [],
  member_types: [],
  job_titles: [],
  business_types: [],
  interests: [],
  include_audience_ids: [],
  exclude_audience_ids: [],
};

export type CreativeDraft = {
  name: string;
  format: CreativeFormat;
  primaryText: string;
  headline: string;
  description: string;
  cta: Cta;
  destinationUrl: string;
  urlParams: string;
  media: { path: string; kind: "image" | "video"; width?: number | null; height?: number | null; durationS?: number | null; previewUrl?: string | null }[];
  postId: string | null;
  listingId: string | null;
  eventId: string | null;
  businessId: string | null;
};

export type WizardDraft = {
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  adId: string | null;
  /** "existing" reuses creativeId from the library; "new" edits `creative`. */
  creativeMode: "existing" | "new";
  name: string;
  objective: AdObjective;
  budgetType: "daily" | "lifetime";
  dailyBudget: string;
  totalBudget: string;
  spendCap: string;
  startsOn: string;
  endsOn: string;
  specialCategory: "none" | "employment" | "housing" | "credit" | "financial_products";
  targeting: TargetingDraft;
  placements: AdPlacement[];
  bidStrategy: BidStrategy;
  bidAmount: string;
  adSetDailyBudget: string;
  frequencyCapPerDay: number;
  creative: CreativeDraft;
};

export function emptyCreative(): CreativeDraft {
  return {
    name: "",
    format: "single_image",
    primaryText: "",
    headline: "",
    description: "",
    cta: "learn_more",
    destinationUrl: "",
    urlParams: "",
    media: [],
    postId: null,
    listingId: null,
    eventId: null,
    businessId: null,
  };
}

export function newDraft(today: Date = new Date()): WizardDraft {
  const start = new Date(Date.parse(`${isoDay(today)}T00:00:00Z`) + 86_400_000);
  const end = new Date(start.getTime() + 29 * 86_400_000);
  return {
    campaignId: null,
    adSetId: null,
    creativeId: null,
    adId: null,
    creativeMode: "new",
    name: "",
    objective: "awareness",
    budgetType: "daily",
    dailyBudget: "",
    totalBudget: "",
    spendCap: "",
    startsOn: isoDay(start),
    endsOn: isoDay(end),
    specialCategory: "none",
    targeting: { ...EMPTY_TARGETING },
    placements: ["feed"],
    bidStrategy: "lowest_cost",
    bidAmount: "",
    adSetDailyBudget: "",
    frequencyCapPerDay: 3,
    creative: emptyCreative(),
  };
}

const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function campaignBody(d: WizardDraft) {
  return {
    name: d.name,
    objective: d.objective,
    budgetType: d.budgetType,
    dailyBudget: d.budgetType === "daily" ? num(d.dailyBudget) : null,
    totalBudget: num(d.totalBudget),
    spendCap: num(d.spendCap),
    startsOn: d.startsOn,
    endsOn: d.endsOn,
    specialCategory: d.specialCategory,
  };
}

export function adSetBody(d: WizardDraft) {
  return {
    name: d.name ? `${d.name} — ad set` : "Ad set",
    placements: d.placements,
    targeting: { ...d.targeting, languages: [] },
    bidStrategy: d.bidStrategy,
    bidAmount: d.bidStrategy === "lowest_cost" ? null : num(d.bidAmount),
    dailyBudget: num(d.adSetDailyBudget),
    frequencyCapPerDay: d.frequencyCapPerDay,
  };
}

export function creativeBody(c: CreativeDraft) {
  return {
    name: c.name,
    format: c.format,
    primaryText: c.primaryText || null,
    headline: c.headline || null,
    description: c.description || null,
    cta: c.cta,
    destinationUrl: c.destinationUrl,
    urlParams: c.urlParams,
    media: c.media.map(({ path, kind, width, height, durationS }) => ({ path, kind, width: width ?? null, height: height ?? null, durationS: durationS ?? null })),
    postId: c.postId,
    listingId: c.listingId,
    eventId: c.eventId,
    businessId: c.businessId,
  };
}

export type StepIssues = Record<string, string[] | undefined>;

function issuesOf(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, only?: string[]): StepIssues {
  if (result.success || !result.error) return {};
  const out: StepIssues = {};
  for (const i of result.error.issues) {
    const key = String(i.path[0] ?? "form");
    if (only && !only.includes(key)) continue;
    (out[key] ??= []).push(i.message);
  }
  return out;
}

/** Problems that stop the given step from being saved. Empty object = step is complete. */
export function stepIssues(step: WizardStepId, d: WizardDraft): StepIssues {
  switch (step) {
    case "objective":
      return issuesOf(campaignUpdateSchema.safeParse(campaignBody(d)), ["name", "objective"]);
    case "budget":
      return issuesOf(campaignUpdateSchema.safeParse(campaignBody(d)));
    case "audience":
      return issuesOf(adSetUpdateSchema.safeParse(adSetBody(d)), ["targeting"]);
    case "placements":
      return issuesOf(adSetUpdateSchema.safeParse(adSetBody(d)), ["placements"]);
    case "bidding":
      return issuesOf(adSetUpdateSchema.safeParse(adSetBody(d)));
    case "creative":
      if (d.creativeMode === "existing") return d.creativeId ? {} : { creativeId: ["Choose a creative from your library"] };
      return issuesOf(creativeUpdateSchema.safeParse(creativeBody(d.creative)));
    case "review":
      return d.campaignId && d.adSetId && d.adId ? {} : { form: ["Finish the earlier steps first"] };
  }
}

/** First step that still needs work — where a resumed draft opens. */
export function firstIncompleteStep(d: WizardDraft): number {
  if (!d.campaignId) return Object.keys(stepIssues("objective", d)).length ? 0 : 1;
  if (!d.adSetId) return 2;
  if (!d.adId) return 5;
  return 6;
}

const major = (minor: number | null | undefined, currency: string) => (minor == null ? "" : String(minorToMajor(minor, currency)));

/** Rebuilds a draft from a saved campaign so the wizard can resume or edit it. */
export function draftFromCampaign(c: CampaignDetail): WizardDraft {
  const d = newDraft();
  const set = c.adSets[0];
  const ad = set?.ads[0];
  const creative = ad ? c.creatives.find((x) => x.id === ad.creativeId) : undefined;
  return {
    ...d,
    campaignId: c.id,
    adSetId: set?.id ?? null,
    adId: ad?.id ?? null,
    creativeId: creative?.id ?? null,
    creativeMode: creative ? "existing" : "new",
    name: c.name,
    objective: c.objective,
    budgetType: c.budgetType,
    dailyBudget: c.budgetType === "daily" ? major(c.dailyBudgetMinor, c.currency) : "",
    totalBudget: major(c.totalBudgetMinor, c.currency),
    spendCap: major(c.spendCapMinor, c.currency),
    startsOn: c.startsOn,
    endsOn: c.endsOn,
    specialCategory: c.specialCategory as WizardDraft["specialCategory"],
    targeting: set ? { ...EMPTY_TARGETING, ...stripLanguages(set.targeting) } : d.targeting,
    placements: set?.placements.length ? set.placements : d.placements,
    bidStrategy: set?.bidStrategy ?? d.bidStrategy,
    bidAmount: major(set?.bidMinor, c.currency),
    adSetDailyBudget: major(set?.dailyBudgetMinor, c.currency),
    frequencyCapPerDay: set?.frequencyCapPerDay ?? d.frequencyCapPerDay,
    creative: creative
      ? {
          name: creative.name,
          format: creative.format,
          primaryText: creative.primaryText ?? "",
          headline: creative.headline ?? "",
          description: creative.description ?? "",
          cta: creative.cta,
          destinationUrl: creative.destinationUrl ?? "",
          urlParams: creative.urlParams ?? "",
          media: creative.media.map((m) => ({ ...m, previewUrl: m.url })),
          postId: creative.postId,
          listingId: creative.listingId,
          eventId: creative.eventId,
          businessId: creative.businessId,
        }
      : emptyCreative(),
  };
}

function stripLanguages(t: Partial<Targeting>): Partial<TargetingDraft> {
  return Object.fromEntries(Object.entries(t).filter(([k]) => k !== "languages")) as Partial<TargetingDraft>;
}
