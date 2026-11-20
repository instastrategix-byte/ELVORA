import { z } from "zod";
import { VISIBILITIES } from "@backend/modules/profiles/schemas";

export const POST_MAX_LENGTH = 5000;
export const MAX_ATTACHMENTS = 4;

export const attachmentSchema = z.object({
  path: z.string().min(3).max(300),
  type: z.enum(["image", "video"]),
  alt: z.string().trim().max(300).optional(),
});

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;

export const pollInputSchema = z.object({
  options: z
    .array(z.string().trim().min(1, { error: "Options can't be empty" }).max(80))
    .min(POLL_MIN_OPTIONS, { error: "Add at least 2 options" })
    .max(POLL_MAX_OPTIONS, { error: "Polls can have up to 4 options" })
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, { error: "Options must be different" }),
  allowMultiple: z.boolean().default(false),
  durationHours: z.number().int().min(1).max(336).default(72),
});

export const createPostSchema = z
  .object({
    body: z.string().trim().max(POST_MAX_LENGTH, { error: `Posts are limited to ${POST_MAX_LENGTH} characters` }),
    visibility: z.enum(VISIBILITIES).default("members"),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
    poll: pollInputSchema.optional(),
  })
  .refine((p) => p.body.length > 0 || p.attachments.length > 0 || Boolean(p.poll), {
    error: "Write something or attach media",
    path: ["body"],
  });
export type CreatePostInput = z.input<typeof createPostSchema>;

export const updatePostSchema = z.object({
  body: z.string().trim().max(POST_MAX_LENGTH).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
});

export const pollVoteSchema = z.object({ optionIds: z.array(z.uuid()).min(1).max(POLL_MAX_OPTIONS) });

export const commentSchema = z.object({
  body: z.string().trim().min(1, { error: "Comment cannot be empty" }).max(2000),
});

export const feedQuerySchema = z.object({
  scope: z.enum(["network", "all"]).default("network"),
  cursor: z.string().max(200).optional(),
});

export const REPORT_REASONS = ["spam", "harassment", "impersonation", "fraud", "inappropriate", "intellectual_property", "other"] as const;
export const REPORT_TARGETS = ["post", "comment", "profile", "listing", "business", "message", "reel"] as const;

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(2000).optional(),
});
