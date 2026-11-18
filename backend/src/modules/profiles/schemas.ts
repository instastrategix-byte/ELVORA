import { z } from "zod";
import { LINK_PLATFORMS, LINK_VISIBILITIES, MAX_PROFILE_LINKS, linkUrlError } from "./links";
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
  interests: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  memberType: z
    .union([z.literal(""), z.enum(MEMBER_TYPES)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  skills: tagList(30, 40),
  openTo: z.array(z.enum(OPEN_TO)).max(OPEN_TO.length).optional(),
  achievements: tagList(10, 160),
  avatarPath: z.string().max(300).nullable().optional(),
  coverPath: z.string().max(300).nullable().optional(),
});
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

export const privacyUpdateSchema = z.object({
  profileVisibility: z.enum(VISIBILITIES),
  discoverable: z.boolean(),
  messagingPolicy: z.enum(MESSAGING_POLICIES),
  /** Reciprocal: when off, you don't share read times and don't see other people's. */
  showReadReceipts: z.boolean().optional(),
});

export const memberSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  industry: z.string().trim().max(60).optional(),
  verified: z.enum(["any", "verified"]).optional(),
  /** Profession, as the member describes themself. */
  memberType: z.enum(MEMBER_TYPES).optional(),
  interest: z.string().trim().max(40).optional(),
  openTo: z.enum(OPEN_TO).optional(),
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

// Profile links: platform-aware URL validation (the database enforces the same rule).
const linkLabel = z
  .string()
  .trim()
  .max(40, { error: "Labels can be up to 40 characters" })
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const addLinkSchema = z
  .object({
    platform: z.enum(LINK_PLATFORMS),
    url: z.string().trim().max(300),
    label: linkLabel,
    visibility: z.enum(LINK_VISIBILITIES).default("members"),
  })
  .superRefine((v, ctx) => {
    const error = linkUrlError(v.platform, v.url);
    if (error) ctx.addIssue({ code: "custom", path: ["url"], message: error });
    if (v.platform === "other" && !v.label) ctx.addIssue({ code: "custom", path: ["label"], message: "Give this link a short name" });
  });

export const updateLinkSchema = z.object({
  url: z.string().trim().max(300).optional(),
  label: linkLabel,
  visibility: z.enum(LINK_VISIBILITIES).optional(),
});

export const reorderLinksSchema = z.object({ ids: z.array(z.uuid()).min(1).max(MAX_PROFILE_LINKS) });
