import { z } from "zod";

export const STORY_VISIBILITIES = ["members", "connections"] as const;
export const STORY_CAPTION_MAX = 200;

export const createStorySchema = z
  .object({
    mediaPath: z.string().min(3).max(300),
    mediaType: z.enum(["image", "video"]),
    caption: z
      .string()
      .trim()
      .max(STORY_CAPTION_MAX, { error: `Captions are limited to ${STORY_CAPTION_MAX} characters` })
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    visibility: z.enum(STORY_VISIBILITIES).default("members"),
  })
  // The upload purpose folder must match the declared media type (story_image / story_video).
  .refine((s) => s.mediaPath.split("/")[1] === `story_${s.mediaType}`, {
    error: "The uploaded file doesn't match the story type",
    path: ["mediaPath"],
  });
export type CreateStoryInput = z.input<typeof createStorySchema>;
