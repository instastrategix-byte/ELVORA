import { z } from "zod";

export const COMMUNITY_VISIBILITIES = ["open", "private"] as const;
export const COMMUNITY_FILTERS = ["all", "joined"] as const;
export const COMMUNITY_CATEGORIES = [
  "Founders",
  "Investing",
  "Leadership",
  "Real estate",
  "Automotive",
  "Yachting",
  "Aviation",
  "Travel",
  "Art & collecting",
  "Philanthropy",
  "Wellness",
  "Technology",
  "Other",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Must be ${max} characters or fewer` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const communitySchema = z.object({
  name: z.string().trim().min(3, { error: "At least 3 characters" }).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, { error: "3–60 characters: lowercase letters, numbers and hyphens" })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: optionalText(2000),
  category: z.enum(COMMUNITY_CATEGORIES).nullable().optional(),
  visibility: z.enum(COMMUNITY_VISIBILITIES),
  coverPath: z.string().max(300).nullable().optional(),
});
export type CommunityInput = z.infer<typeof communitySchema>;

export const communityUpdateSchema = communitySchema.omit({ slug: true });

export const communityListQuerySchema = z.object({
  filter: z.enum(COMMUNITY_FILTERS).default("all"),
  q: z.string().trim().max(80).optional(),
  category: z.enum(COMMUNITY_CATEGORIES).optional(),
  cursor: z.string().max(200).optional(),
});

export const memberActionSchema = z.object({
  userId: z.uuid(),
  action: z.enum(["approve", "decline", "ban", "unban", "remove", "promote", "demote"]),
});

export const threadSchema = z.object({
  title: z.string().trim().min(3, { error: "At least 3 characters" }).max(160),
  body: z.string().trim().min(1, { error: "Write something" }).max(5000),
});

export const threadUpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    pinned: z.boolean().optional(),
    locked: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "Nothing to update" });

export const replySchema = z.object({ body: z.string().trim().min(1, { error: "Write a reply" }).max(3000) });

export const cursorQuerySchema = z.object({ cursor: z.string().max(200).optional() });

/** "Founders in Dubai!" → "founders-in-dubai" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
