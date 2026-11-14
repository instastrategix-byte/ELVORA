import { z } from "zod";

export const MESSAGE_MAX_LENGTH = 4000;

export const startConversationSchema = z.object({ userId: z.uuid() });

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, { error: "Message cannot be empty" }).max(MESSAGE_MAX_LENGTH),
  /** Client-generated idempotency key; retries with the same key are stored once. */
  clientId: z.uuid(),
});

export const messagesQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
