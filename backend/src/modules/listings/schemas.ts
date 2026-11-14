import { z } from "zod";

export const LISTING_CATEGORIES = ["hotel", "resort", "villa", "apartment", "supercar", "yacht", "event", "experience"] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  hotel: "Hotels",
  resort: "Resorts",
  villa: "Villas",
  apartment: "Residences",
  supercar: "Supercars",
  yacht: "Yachts",
  event: "Events",
  experience: "Experiences",
};

export const PRICE_UNITS = ["night", "week", "month", "day", "person", "event", "total"] as const;
export const BUSINESS_CATEGORIES = [
  "hospitality", "real_estate", "automotive", "yachting", "aviation", "events", "experiences", "concierge", "other",
] as const;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const businessSchema = z.object({
  name: z.string().trim().min(2, { error: "Business name is required" }).max(120),
  category: z.enum(BUSINESS_CATEGORIES),
  description: optional(3000),
  website: z
    .union([z.literal(""), z.url({ protocol: /^https$/, error: "Use a full https:// address" })])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  location: optional(120),
  contactEmail: z
    .union([z.literal(""), z.email({ error: "Enter a valid email" })])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  registrationNumber: optional(80),
  logoPath: z.string().max(300).nullable().optional(),
  evidencePaths: z.array(z.string().max(300)).max(5).optional(),
});
export type BusinessInput = z.input<typeof businessSchema>;

export const listingSchema = z
  .object({
    title: z.string().trim().min(3, { error: "Title is required" }).max(140),
    category: z.enum(LISTING_CATEGORIES),
    summary: optional(240),
    description: optional(6000),
    city: optional(80),
    country: optional(80),
    priceFrom: z.number().nonnegative().max(1e10).nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    priceUnit: z.enum(PRICE_UNITS).nullable().optional(),
    amenities: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    visibility: z.enum(["public", "members"]).default("public"),
    coverPath: z.string().max(300).nullable().optional(),
  })
  .refine((l) => (l.priceFrom == null) === (l.currency == null), {
    error: "Provide both a price and a currency, or neither",
    path: ["currency"],
  });
export type ListingInput = z.input<typeof listingSchema>;

export const listingActionSchema = z.object({ action: z.enum(["submit", "archive", "publish", "draft"]) });

export const listingBrowseSchema = z.object({
  category: z.enum(LISTING_CATEGORIES).optional(),
  q: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
});
export type ListingBrowse = z.infer<typeof listingBrowseSchema>;

export const inquirySchema = z.object({
  message: z.string().trim().min(10, { error: "Please include a short message (10+ characters)" }).max(2000),
  preferredDates: z.string().trim().max(120).optional(),
  partySize: z.number().int().min(1).max(500).optional(),
});

export const inquiryStatusSchema = z.object({ status: z.enum(["new", "responded", "closed"]) });

export const listingMediaSchema = z.object({
  path: z.string().min(3).max(300),
  alt: z.string().trim().max(300).optional(),
});
