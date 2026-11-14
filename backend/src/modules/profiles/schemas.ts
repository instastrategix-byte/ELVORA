import { z } from "zod";

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
