import { z } from "zod";
import { VISIBILITIES } from "@backend/modules/profiles/schemas";

export const POST_MAX_LENGTH = 5000;
export const MAX_ATTACHMENTS = 4;

export const attachmentSchema = z.object({
  path: z.string().min(3).max(300),
  type: z.enum(["image", "video"]),
  alt: z.string().trim().max(300).optional(),
});

export const createPostSchema = z
  .object({
    body: z.string().trim().max(POST_MAX_LENGTH, { error: `Posts are limited to ${POST_MAX_LENGTH} characters` }),
    visibility: z.enum(VISIBILITIES).default("members"),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
  })
  .refine((p) => p.body.length > 0 || p.attachments.length > 0, {
    error: "Write something or attach media",
    path: ["body"],
  });
export type CreatePostInput = z.input<typeof createPostSchema>;

export const updatePostSchema = z.object({
  body: z.string().trim().max(POST_MAX_LENGTH).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, { error: "Comment cannot be empty" }).max(2000),
});

export const feedQuerySchema = z.object({
  scope: z.enum(["network", "all"]).default("network"),
  cursor: z.string().max(200).optional(),
});

export const REPORT_REASONS = ["spam", "harassment", "impersonation", "fraud", "inappropriate", "intellectual_property", "other"] as const;
export const REPORT_TARGETS = ["post", "comment", "profile", "listing", "business", "message"] as const;

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(2000).optional(),
});
