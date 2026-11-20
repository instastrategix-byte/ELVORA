import { z } from "zod";
import { REEL_MAX_CAPTION, REEL_MAX_COMMENT, REEL_MAX_SECONDS } from "./types";

const storagePath = z.string().regex(/^[0-9a-f-]{36}\/reel_(video|poster)\/[0-9a-f-]{36}\.(mp4|webm|jpg|webp)$/, { error: "Invalid upload" });

export const createReelSchema = z.object({
  caption: z.string().trim().max(REEL_MAX_CAPTION).default(""),
  videoPath: storagePath,
  posterPath: storagePath.nullable().optional(),
  durationS: z.number().positive().max(REEL_MAX_SECONDS, { error: `Reels can be up to ${REEL_MAX_SECONDS} seconds long` }),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
  visibility: z.enum(["members", "connections"]).default("members"),
});

export const reelCommentSchema = z.object({ body: z.string().trim().min(1, { error: "Write a comment" }).max(REEL_MAX_COMMENT) });

export const reelFeedQuery = z.object({
  /** Comma-separated ids already shown, so the next page doesn't repeat them. */
  exclude: z
    .string()
    .max(200 * 37)
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean).slice(0, 200) : []))
    .pipe(z.array(z.uuid())),
  author: z.uuid().optional(),
  before: z.iso.datetime({ offset: true }).optional(),
});

export const reelCommentsQuery = z.object({ before: z.iso.datetime({ offset: true }).optional() });

export const shareReelSchema = z.object({
  conversationIds: z.array(z.uuid()).min(1, { error: "Choose who to send it to" }).max(10),
  note: z.string().trim().max(500).optional(),
});

export const reelCommentParams = z.object({ id: z.uuid(), commentId: z.uuid() });
