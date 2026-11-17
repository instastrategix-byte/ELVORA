import { z } from "zod";
import { MEMBER_TYPES, OPEN_TO } from "./types";

export const VISIBILITIES = ["public", "members", "connections"] as const;
export const MESSAGING_POLICIES = ["connections", "members", "nobody"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Must be ${max} characters or fewer` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, { error: "3–30 characters: lowercase letters, numbers and underscores" })
  .refine((h) => !/^member_[0-9a-f]{12}$/.test(h), { error: "Please choose a personal handle" });

const httpsUrl = (label: string) =>
  z
    .union([
      z.literal(""),
      z.url({ protocol: /^https$/, error: `Use a full https:// ${label} address` }).max(200, { error: "Must be 200 characters or fewer" }),
    ])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const tagList = (maxItems: number, maxLen: number) =>
  z
    .array(z.string().trim().min(1).max(maxLen, { error: `Each entry must be ${maxLen} characters or fewer` }))
    .max(maxItems, { error: `Add at most ${maxItems}` })
    .transform((values) => [...new Set(values)])
    .optional();

export const profileUpdateSchema = z.object({
  handle: handleSchema.optional(),
  displayName: z.string().trim().min(1, { error: "Name is required" }).max(80).optional(),
  headline: optionalText(120),
  bio: optionalText(1000),
  jobTitle: optionalText(80),
  company: optionalText(80),
  industry: optionalText(60),
  location: optionalText(120),
  website: z
    .union([z.literal(""), z.url({ protocol: /^https$/, error: "Use a full https:// address" })])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  memberType: z
    .union([z.literal(""), z.enum(MEMBER_TYPES)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  skills: tagList(30, 40),
  openTo: z.array(z.enum(OPEN_TO)).max(OPEN_TO.length).optional(),
  achievements: tagList(10, 160),
  linkedinUrl: httpsUrl("LinkedIn"),
  xUrl: httpsUrl("X"),
  instagramUrl: httpsUrl("Instagram"),
  avatarPath: z.string().max(300).nullable().optional(),
  coverPath: z.string().max(300).nullable().optional(),
});
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

export const privacyUpdateSchema = z.object({
  profileVisibility: z.enum(VISIBILITIES),
  discoverable: z.boolean(),
  messagingPolicy: z.enum(MESSAGING_POLICIES),
});

export const memberSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  industry: z.string().trim().max(60).optional(),
  verified: z.enum(["any", "verified"]).optional(),
  cursor: z.string().max(200).optional(),
});
export type MemberSearch = z.infer<typeof memberSearchSchema>;

const isoDate = z.iso.date({ error: "Enter a valid date" });

const experienceFields = {
  title: z.string().trim().min(1, { error: "Title is required" }).max(80),
  company: z.string().trim().min(1, { error: "Company is required" }).max(80),
  location: optionalText(120),
  startsOn: isoDate,
  endsOn: z
    .union([z.literal(""), isoDate])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  description: optionalText(600),
};

const endAfterStart = (v: { startsOn?: string; endsOn?: string | null }) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn;
const endAfterStartError = { error: "End date must be after the start date", path: ["endsOn"] };

export const experienceSchema = z.object(experienceFields).refine(endAfterStart, endAfterStartError);
export const experienceUpdateSchema = z.object(experienceFields).partial().refine(endAfterStart, endAfterStartError);
export type ExperienceInput = z.input<typeof experienceSchema>;
