import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import { ATTACHMENT_BUCKET, ATTACHMENT_TYPES, checkAttachment, sanitizeFileName, type uploadUrlSchema } from "./attachments";
import type { sendMessageSchema } from "./schemas";
import type { ConversationDetail, ConversationSummary, MessageAttachment, MessageView, ReactionSummary } from "./types";

const PREVIEW_LENGTH = 120;

export async function listConversations(db: DbClient, viewer: Viewer, before?: string): Promise<ConversationSummary[]> {
  const rows = unwrap(await db.rpc("conversation_summaries", { p_limit: 30, p_before: before }));
  const others = await getSummaries(db, rows.map((r) => r.other_user_id!).filter(Boolean));
  return rows.map((r) => ({
    id: r.conversation_id!,
    other: others.get(r.other_user_id!)!,
    lastMessageAt: r.last_message_at,
    // Text-only messages always have a body, so an empty body means an attachment-only message.
    lastMessagePreview: r.last_message_body
      ? r.last_message_body.slice(0, PREVIEW_LENGTH)
      : r.last_message_at
        ? "Sent an attachment"
        : null,
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
  // Read state goes through conversation_read_state, which applies reciprocal read-receipt
  // privacy (other participants' last_read_at isn't directly readable). Non-participants get no rows.
  const participants = (unwrap(await db.rpc("conversation_read_state", { p_conversation: conversationId })) ?? []) as ReadStateRow[];
  if (!participants.some((p) => p.user_id === viewer.id)) return null;
  const other = participants.find((p) => p.user_id !== viewer.id);
  if (!other) return null;
  const [profiles, canMessage] = await Promise.all([
    getSummaries(db, [other.user_id]),
    db.rpc("can_message", { p_other: other.user_id }),
  ]);
  return {
    id: conversationId,
    other: profiles.get(other.user_id)!,
    otherLastReadAt: other.receipts_visible ? other.last_read_at : null,
    readReceipts: other.receipts_visible,
    canSend: Boolean(unwrap(canMessage)),
  };
}

type MessageRow = { id: string; conversation_id: string; sender_id: string; body: string; client_id: string; created_at: string };

const MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, client_id, created_at";

function toView(r: MessageRow, attachments: MessageAttachment[] = []): MessageView {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    clientId: r.client_id,
    createdAt: r.created_at,
    attachments,
  };
}

/** Loads attachments for a page of messages (one query + one batch of signed URLs). */
async function hydrate(db: DbClient, rows: MessageRow[]): Promise<MessageView[]> {
  if (rows.length === 0) return [];
  const atts = unwrap(
    await db
      .from("message_attachments")
      .select("id, message_id, conversation_id, storage_path, file_name, mime_type, size_bytes, kind, width, height, position")
      .in(
        "message_id",
        rows.map((r) => r.id),
      )
      .order("position"),
  );
  const urls = new Map<string, string>();
  if (atts.length) {
    // Access is decided by storage RLS: only participants can sign these paths.
    const { data } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrls(
      atts.map((a) => a.storage_path),
      3600,
    );
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  const byMessage = new Map<string, MessageAttachment[]>();
  for (const a of atts) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push({
      id: a.id,
      kind: a.kind as MessageAttachment["kind"],
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: Number(a.size_bytes),
      width: a.width,
      height: a.height,
      url: urls.get(a.storage_path) ?? null,
      downloadUrl: `/api/v1/conversations/${a.conversation_id}/attachments/${a.id}`,
    });
    byMessage.set(a.message_id, list);
  }
  return rows.map((r) => toView(r, byMessage.get(r.id) ?? []));
}

/** One message by id, with attachments (RLS: participants only). */
export async function getMessage(db: DbClient, messageId: string): Promise<MessageView | null> {
  const row = unwrap(await db.from("messages").select(MESSAGE_COLUMNS).eq("id", messageId).maybeSingle());
  if (!row) return null;
  return (await hydrate(db, [row]))[0] ?? null;
}

/**
 * Issues a signed upload URL for one attachment, after checking the viewer is a participant who may
 * message, and the file's name, type and size. The object path is generated server-side under
 * "<conversation>/<viewer>/"; storage RLS enforces the same folder rule independently.
 */
export async function createAttachmentUpload(
  db: DbClient,
  viewer: Viewer,
  conversationId: string,
  input: z.infer<typeof uploadUrlSchema>,
): Promise<{ path: string; token: string; signedUrl: string; mimeType: string }> {
  const conversation = await getConversation(db, viewer, conversationId);
  if (!conversation) throw new AppError("not_found", "Conversation not found.");
  if (!conversation.canSend) throw new AppError("forbidden", "You can't send messages in this conversation.");
  const check = checkAttachment({ name: input.fileName, type: input.mimeType, size: input.size });
  if (!check.ok) throw new AppError("validation_failed", check.error, { file: [check.error] });
  const ext = ATTACHMENT_TYPES[check.mimeType]!.ext;
  const path = `${conversationId}/${viewer.id}/${crypto.randomUUID()}.${ext}`;
  const result = unwrap(await db.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path));
  return { path: result.path, token: result.token, signedUrl: result.signedUrl, mimeType: check.mimeType };
}

/** A short-lived signed URL for one attachment: inline (open) or as a download with its original name. */
export async function attachmentSignedUrl(db: DbClient, conversationId: string, attachmentId: string, download: boolean): Promise<string | null> {
  const att = unwrap(
    await db
      .from("message_attachments")
      .select("storage_path, file_name")
      .eq("id", attachmentId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
  );
  if (!att) return null;
  const { data } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(att.storage_path, 300, download ? { download: sanitizeFileName(att.file_name) } : undefined);
  return data?.signedUrl ?? null;
}

/** Message history, newest first in the query, returned oldest-first for display. */
export async function listMessages(
  db: DbClient,
  conversationId: string,
  opts: { before?: string; limit: number },
): Promise<{ items: MessageView[]; hasMore: boolean }> {
  let query = db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(opts.limit + 1);
  if (opts.before) query = query.lt("created_at", opts.before);
  const rows = unwrap(await query);
  const hasMore = rows.length > opts.limit;
  const items = await hydrate(db, rows.slice(0, opts.limit).reverse());
  return { items: await withReactionsAndReceipts(db, conversationId, items), hasMore };
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
  if (input.attachments.length > 0) {
    for (const a of input.attachments) {
      if (!a.path.startsWith(`${conversationId}/${viewer.id}/`) || a.path.includes("..")) {
        throw new AppError("forbidden", "You can only attach your own uploads.");
      }
      const check = checkAttachment({ name: a.fileName, type: a.mimeType, size: a.size });
      if (!check.ok) throw new AppError("validation_failed", check.error, { attachments: [check.error] });
    }
    const id = unwrap(
      await db.rpc("send_message_with_attachments", {
        p_conversation: conversationId,
        p_client_id: input.clientId,
        p_body: input.body,
        p_attachments: input.attachments.map((a) => ({ ...a, fileName: sanitizeFileName(a.fileName) })),
      }),
    ) as unknown as string;
    const saved = await getMessage(db, id);
    if (!saved) throw new AppError("internal", "Your message could not be loaded.");
    return saved;
  }
  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: viewer.id, body: input.body, client_id: input.clientId })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error?.code === "23505") {
    const existing = unwrap(
      await db
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("sender_id", viewer.id)
        .eq("client_id", input.clientId)
        .single(),
    );
    if (existing.conversation_id !== conversationId) throw new AppError("conflict", "Duplicate message id.");
    return (await hydrate(db, [existing]))[0]!;
  }
  if (error) {
    throwIfError(error, "Your message could not be sent.");
  }
  return toView(data!, []);
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

type ReadStateRow = { user_id: string; last_read_at: string | null; receipts_visible: boolean; is_self: boolean };

/**
 * Adds reaction summaries (one query for the whole page) and, for the viewer's own messages,
 * whether the other participant has read them (only when both have read receipts on).
 */
export async function withReactionsAndReceipts(db: DbClient, conversationId: string, items: MessageView[]): Promise<MessageView[]> {
  if (items.length === 0) return items;
  const [reactionRows, readState] = await Promise.all([
    db
      .from("message_reactions")
      .select("message_id, user_id, emoji, created_at")
      .in(
        "message_id",
        items.map((m) => m.id),
      )
      .order("created_at", { ascending: true })
      .limit(2000),
    db.rpc("conversation_read_state", { p_conversation: conversationId }),
  ]);
  const state = (unwrap(readState) ?? []) as ReadStateRow[];
  const selfId = state.find((r) => r.is_self)?.user_id ?? null;
  const othersRead = state.filter((r) => !r.is_self && r.receipts_visible && r.last_read_at).map((r) => r.last_read_at!);
  const byMessage = summarizeReactions(unwrap(reactionRows), selfId);
  return items.map((m) => ({
    ...m,
    reactions: byMessage.get(m.id) ?? [],
    readByOthers: m.senderId === selfId && othersRead.some((t) => t >= m.createdAt),
  }));
}

/** Groups reaction rows into per-message summaries, ordered by first use. */
export function summarizeReactions(
  rows: { message_id: string; user_id: string; emoji: string }[],
  viewerId: string | null,
): Map<string, ReactionSummary[]> {
  const out = new Map<string, ReactionSummary[]>();
  for (const r of rows) {
    const list = out.get(r.message_id) ?? [];
    let entry = list.find((x) => x.emoji === r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, reactedByViewer: false };
      list.push(entry);
    }
    entry.count += 1;
    if (r.user_id === viewerId) entry.reactedByViewer = true;
    out.set(r.message_id, list);
  }
  return out;
}

/** Adds (or keeps) the viewer's reaction. Idempotent: reacting twice with the same emoji is a no-op. */
export async function addReaction(db: DbClient, viewer: Viewer, messageId: string, emoji: string): Promise<void> {
  const { error } = await db.from("message_reactions").insert({ message_id: messageId, user_id: viewer.id, emoji });
  if (error?.code === "23505") return;
  if (error?.code === "54000") throw new AppError("business_rule", "You can add up to 6 reactions to a message.");
  if (error?.code === "42501") throw new AppError("not_found", "Message not found.");
  throwIfError(error, "Your reaction could not be saved.");
}

export async function removeReaction(db: DbClient, viewer: Viewer, messageId: string, emoji: string): Promise<void> {
  unwrap(await db.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", viewer.id).eq("emoji", emoji));
}

/** Current reaction summaries for one message, from the viewer's perspective. */
export async function messageReactions(db: DbClient, viewer: Viewer, messageId: string): Promise<ReactionSummary[]> {
  const rows = unwrap(
    await db.from("message_reactions").select("message_id, user_id, emoji, created_at").eq("message_id", messageId).order("created_at", { ascending: true }),
  );
  return summarizeReactions(rows, viewer.id).get(messageId) ?? [];
}
