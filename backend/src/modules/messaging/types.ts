import type { ProfileSummary } from "@backend/modules/profiles/types";

/** How long after sending a message its sender may unsend it (the database enforces this). */
export const UNSEND_WINDOW_MS = 10 * 60_000;

/** Whether a message can still be unsent at `now`. A UI hint only; the server decides. */
export function canUnsend(message: { senderId: string; createdAt: string; unsentAt: string | null }, viewerId: string, now = Date.now()): boolean {
  return message.senderId === viewerId && !message.unsentAt && now - Date.parse(message.createdAt) < UNSEND_WINDOW_MS;
}

export type ConversationSummary = {
  id: string;
  other: ProfileSummary;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromViewer: boolean;
  unreadCount: number;
};

/** Aggregated reactions on one message, from the viewer's perspective. */
export type ReactionSummary = {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
};

export type MessageView = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientId: string;
  createdAt: string;
  /** Set when the sender unsent the message; the body and attachments are then empty. */
  unsentAt: string | null;
  /** Files shared with the message. URLs are short-lived signed URLs, never public. */
  attachments: MessageAttachment[];
  /** Present on messages loaded through the API (absent on realtime payloads until reconciled). */
  reactions?: ReactionSummary[];
  /**
   * True when the other participant has read this message AND both have read receipts on.
   * Only meaningful for the viewer's own messages.
   */
  readByOthers?: boolean;
};

export type MessageAttachment = {
  id: string;
  kind: "image" | "video" | "document";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Signed URL (1 hour) for viewing; null if it couldn't be issued. */
  url: string | null;
  /** Signed URL that downloads with the original file name. */
  downloadUrl: string | null;
};

export type ConversationDetail = {
  id: string;
  other: ProfileSummary;
  /** Null when read receipts are off for either participant (reciprocal privacy). */
  otherLastReadAt: string | null;
  /** Whether read receipts are shared in this conversation (both participants have them on). */
  readReceipts: boolean;
  canSend: boolean;
};

/** Realtime broadcast payloads (see supabase/migrations/..._storage_realtime.sql). */
export type RealtimeEvents = {
  "message.created": { id: string; conversation_id: string; sender_id: string; body: string; client_id: string; created_at: string };
  "message.updated": { id: string; client_id: string; conversation_id: string };
  "message.unsent": { id: string; client_id: string; conversation_id: string };
  "conversation.read": { user_id: string; last_read_at: string };
  "reaction.changed": { message_id: string; user_id: string; emoji: string; op: "add" | "remove" };
  "notification.created": { id: string; type: string; created_at: string };
  "inbox.updated": { conversation_id: string };
  "connection.updated": { id: string; status: string };
};
