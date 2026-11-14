import { z } from "zod";

export const CAMPAIGN_OBJECTIVES = ["awareness", "traffic", "inquiries"] as const;
export const AD_PLACEMENTS = ["feed", "luxury", "discover"] as const;

export const advertiserAccountSchema = z.object({
  displayName: z.string().trim().min(2, { error: "Name is required" }).max(120),
  billingEmail: z
    .union([z.literal(""), z.email({ error: "Enter a valid email" })])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

const dateString = z.iso.date({ error: "Use YYYY-MM-DD" });

export const campaignSchema = z
  .object({
    name: z.string().trim().min(3, { error: "Name is required" }).max(120),
    objective: z.enum(CAMPAIGN_OBJECTIVES),
    currency: z.string().regex(/^[A-Z]{3}$/),
    dailyBudget: z.number().positive({ error: "Daily budget must be positive" }).max(1e8),
    totalBudget: z.number().positive().max(1e9),
    startsOn: dateString,
    endsOn: dateString,
    headline: z.string().trim().min(3, { error: "Headline is required" }).max(90),
    body: z.string().trim().max(280).optional(),
    destinationUrl: z
      .union([z.literal(""), z.url({ protocol: /^https$/, error: "Use a full https:// address" })])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    listingId: z.uuid().nullable().optional(),
    targetLocations: z.array(z.string().trim().min(2).max(60)).max(20).default([]),
    targetInterests: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
    frequencyCapPerDay: z.number().int().min(1).max(20).default(3),
  })
  .refine((c) => c.totalBudget >= c.dailyBudget, { error: "Total budget must be at least the daily budget", path: ["totalBudget"] })
  .refine((c) => c.endsOn >= c.startsOn, { error: "End date must be on or after the start date", path: ["endsOn"] })
  .refine((c) => Boolean(c.destinationUrl) || Boolean(c.listingId), {
    error: "Choose a destination link or one of your listings",
    path: ["destinationUrl"],
  });
export type CampaignInput = z.input<typeof campaignSchema>;

export const campaignActionSchema = z.object({ action: z.enum(["submit", "pause", "resume", "withdraw", "end"]) });
export const serveQuerySchema = z.object({ placement: z.enum(AD_PLACEMENTS) });
export const clickSchema = z.object({ impressionId: z.uuid() });
