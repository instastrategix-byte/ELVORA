import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { sendMessageSchema } from "./schemas";
import type { ConversationDetail, ConversationSummary, MessageView } from "./types";

const PREVIEW_LENGTH = 120;

export async function listConversations(db: DbClient, viewer: Viewer, before?: string): Promise<ConversationSummary[]> {
  const rows = unwrap(await db.rpc("conversation_summaries", { p_limit: 30, p_before: before }));
  const others = await getSummaries(db, rows.map((r) => r.other_user_id!).filter(Boolean));
  return rows.map((r) => ({
    id: r.conversation_id!,
    other: others.get(r.other_user_id!)!,
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_body ? r.last_message_body.slice(0, PREVIEW_LENGTH) : null,
    lastMessageFromViewer: r.last_message_sender === viewer.id,
    unreadCount: Number(r.unread_count ?? 0),
  }));
}

export async function unreadConversationCount(db: DbClient): Promise<number> {
  const rows = unwrap(await db.rpc("conversation_summaries", { p_limit: 50 }));
  return rows.filter((r) => Number(r.unread_count ?? 0) > 0).length;
}

export async function startConversation(db: DbClient, viewer: Viewer, otherId: string): Promise<{ id: string }> {
  if (otherId === viewer.id) throw new AppError("business_rule", "You cannot message yourself.");
  const id = unwrap(await db.rpc("start_conversation", { p_other: otherId }));
  return { id };
}

export async function getConversation(db: DbClient, viewer: Viewer, conversationId: string): Promise<ConversationDetail | null> {
  const participants = unwrap(
    await db.from("conversation_participants").select("user_id, last_read_at").eq("conversation_id", conversationId),
  );
  if (!participants.some((p) => p.user_id === viewer.id)) return null; // RLS returns nothing for non-participants
  const other = participants.find((p) => p.user_id !== viewer.id);
  if (!other) return null;
  const [profiles, canMessage] = await Promise.all([
    getSummaries(db, [other.user_id]),
    db.rpc("can_message", { p_other: other.user_id }),
  ]);
  return {
    id: conversationId,
    other: profiles.get(other.user_id)!,
    otherLastReadAt: other.last_read_at,
    canSend: Boolean(unwrap(canMessage)),
  };
}

function toView(r: { id: string; conversation_id: string; sender_id: string; body: string; client_id: string; created_at: string }): MessageView {
  return { id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, body: r.body, clientId: r.client_id, createdAt: r.created_at };
}

/** Message history, newest first in the query, returned oldest-first for display. */
export async function listMessages(
  db: DbClient,
  conversationId: string,
  opts: { before?: string; limit: number },
): Promise<{ items: MessageView[]; hasMore: boolean }> {
  let query = db
    .from("messages")
    .select("id, conversation_id, sender_id, body, client_id, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(opts.limit + 1);
  if (opts.before) query = query.lt("created_at", opts.before);
  const rows = unwrap(await query);
  const hasMore = rows.length > opts.limit;
  return { items: rows.slice(0, opts.limit).reverse().map(toView), hasMore };
}

/**
 * Persists a message. Idempotent on (sender, clientId): a retried request returns the
 * originally stored message instead of creating a duplicate. The realtime broadcast is
 * emitted by a database trigger only after the row is written.
 */
export async function sendMessage(
  db: DbClient,
  viewer: Viewer,
  conversationId: string,
  input: z.infer<typeof sendMessageSchema>,
): Promise<MessageView> {
  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: viewer.id, body: input.body, client_id: input.clientId })
    .select("id, conversation_id, sender_id, body, client_id, created_at")
    .single();
  if (error?.code === "23505") {
    const existing = unwrap(
      await db
        .from("messages")
        .select("id, conversation_id, sender_id, body, client_id, created_at")
        .eq("sender_id", viewer.id)
        .eq("client_id", input.clientId)
        .single(),
    );
    if (existing.conversation_id !== conversationId) throw new AppError("conflict", "Duplicate message id.");
    return toView(existing);
  }
  if (error) {
    throwIfError(error, "Your message could not be sent.");
  }
  return toView(data!);
}

export async function markConversationRead(db: DbClient, viewer: Viewer, conversationId: string) {
  const now = new Date().toISOString();
  unwrap(
    await db
      .from("conversation_participants")
      .update({ last_read_at: now })
      .eq("conversation_id", conversationId)
      .eq("user_id", viewer.id),
  );
  // Clear the collapsed "new message" notification for this conversation.
  unwrap(
    await db
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", viewer.id)
      .eq("type", "message")
      .eq("entity_id", conversationId)
      .is("read_at", null),
  );
}
