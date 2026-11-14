import type { ProfileSummary } from "@backend/modules/profiles/types";

export type ConversationSummary = {
  id: string;
  other: ProfileSummary;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromViewer: boolean;
  unreadCount: number;
};

export type MessageView = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientId: string;
  createdAt: string;
};

export type ConversationDetail = {
  id: string;
  other: ProfileSummary;
  otherLastReadAt: string | null;
  canSend: boolean;
};

/** Realtime broadcast payloads (see supabase/migrations/..._storage_realtime.sql). */
export type RealtimeEvents = {
  "message.created": { id: string; conversation_id: string; sender_id: string; body: string; client_id: string; created_at: string };
  "conversation.read": { user_id: string; last_read_at: string };
  "notification.created": { id: string; type: string; created_at: string };
  "inbox.updated": { conversation_id: string };
  "connection.updated": { id: string; status: string };
};
