import { z } from "zod";
import { attachmentRefSchema, MAX_ATTACHMENTS } from "./attachments";

export const MESSAGE_MAX_LENGTH = 4000;

export const startConversationSchema = z.object({ userId: z.uuid() });

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(MESSAGE_MAX_LENGTH).default(""),
    /** Client-generated idempotency key; retries with the same key are stored once. */
    clientId: z.uuid(),
    /** Files already uploaded to the conversation's attachment folder (see attachments.ts). */
    attachments: z.array(attachmentRefSchema).max(MAX_ATTACHMENTS, { error: `Attach up to ${MAX_ATTACHMENTS} files` }).default([]),
  })
  .refine((v) => v.body.length > 0 || v.attachments.length > 0, { error: "Message cannot be empty", path: ["body"] });

export const messagesQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

/**
 * One emoji (incl. ZWJ sequences, flags, keycaps, skin tones, variation selectors). Letters,
 * plain digits, whitespace and markup are rejected; the database re-checks length and characters.
 */
const EMOJI_RE =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|️|‍|⃣|[\u{E0020}-\u{E007F}])*$/u;

export function isEmoji(value: string): boolean {
  return value.length >= 1 && value.length <= 16 && EMOJI_RE.test(value);
}

export const reactionSchema = z.object({
  emoji: z.string().refine(isEmoji, { error: "Choose an emoji" }),
});
