"use client";

import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import type { UploadedAttachment } from "@/lib/attachment-upload";
import type { ConversationDetail, MessageAttachment, MessageView, ReactionSummary } from "@backend/modules/messaging/types";
import { Composer, type ComposerSendInput } from "./composer";
import { EmojiPicker } from "./emoji-picker";
import { applyReactionEvent, MessageReactions, QuickReact } from "./message-reactions";
import { MessageAttachments } from "./message-attachments";

type LocalMessage = MessageView & {
  state?: "sending" | "failed";
  /** Kept so a failed send can be retried with the same uploads. */
  pendingUploads?: UploadedAttachment[];
};

const DAY = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return DAY.format(d);
}

/**
 * A conversation thread. Messages are persisted through the API first; the realtime event that
 * follows is de-duplicated by id/clientId. On every (re)subscribe the thread reloads recent
 * history from the database, so nothing is lost if the socket drops.
 */
export function Thread({
  viewerId,
  conversation,
  initial,
  initialHasMore,
}: {
  viewerId: string;
  conversation: ConversationDetail;
  initial: MessageView[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState<LocalMessage[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [otherReadAt, setOtherReadAt] = useState(conversation.otherLastReadAt);
  const [otherTyping, setOtherTyping] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const upsert = useCallback((incoming: LocalMessage[]) => {
    setMessages((prev) => {
      const byKey = new Map(prev.map((m) => [m.clientId, m]));
      for (const m of incoming) {
        const existing = byKey.get(m.clientId);
        // A bare realtime event carries no attachments; never let it wipe ones we already have.
        const attachments = m.attachments.length === 0 && existing?.attachments.length ? existing.attachments : m.attachments;
        byKey.set(m.clientId, { ...existing, ...m, attachments, state: m.state });
      }
      return [...byKey.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const setReactions = useCallback((messageId: string, update: (current: ReactionSummary[]) => ReactionSummary[]) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: update(m.reactions ?? []) } : m)));
  }, []);

  const markRead = useCallback(() => {
    void api(`/api/v1/conversations/${conversation.id}/read`, { method: "POST" }).catch(() => undefined);
  }, [conversation.id]);

  const sync = useCallback(async () => {
    try {
      const page = await api<{ items: MessageView[]; hasMore: boolean }>(`/api/v1/conversations/${conversation.id}/messages?limit=30`);
      upsert(page.items);
      markRead();
    } catch {
      // keep showing what we have
    }
  }, [conversation.id, upsert, markRead]);

  const { status, channel } = useRealtime(
    `conversation:${conversation.id}`,
    {
      "message.created": (p) => {
        const m: MessageView = {
          id: String(p.id),
          conversationId: String(p.conversation_id),
          senderId: String(p.sender_id),
          body: String(p.body),
          clientId: String(p.client_id),
          createdAt: String(p.created_at),
          attachments: [],
        };
        if (m.senderId !== viewerId) {
          setOtherTyping(false);
          markRead();
        }
        // Attachment-only messages arrive with an empty body; "message.updated" follows with the files.
        if (m.body === "") return;
        upsert([m]);
      },
      "message.updated": () => {
        void sync();
      },
      "reaction.changed": (p) => {
        // The viewer's own reactions were already applied optimistically.
        if (p.user_id === viewerId || typeof p.message_id !== "string" || typeof p.emoji !== "string") return;
        const event = { user_id: String(p.user_id), emoji: p.emoji, op: p.op === "remove" ? ("remove" as const) : ("add" as const) };
        setReactions(p.message_id, (current) => applyReactionEvent(current, event, viewerId));
      },
      "conversation.read": (p) => {
        // Read receipts are reciprocal: ignore read events unless both participants share them.
        if (conversation.readReceipts && p.user_id !== viewerId && typeof p.last_read_at === "string") setOtherReadAt(p.last_read_at);
      },
      typing: (p) => {
        if (p.user_id === viewerId) return;
        setOtherTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setOtherTyping(false), 4000);
      },
    },
    sync,
  );

  useEffect(() => {
    markRead();
  }, [markRead]);

  // Scroll only when the newest message changes (not when older history is prepended).
  const newestKey = messages.at(-1)?.clientId;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [newestKey]);

  async function deliver(message: LocalMessage, uploads: UploadedAttachment[], previews: string[]) {
    upsert([{ ...message, state: "sending" }]);
    try {
      const saved = await api<MessageView>(`/api/v1/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: { body: message.body, clientId: message.clientId, attachments: uploads },
      });
      upsert([{ ...saved, state: undefined, pendingUploads: undefined }]);
      previews.forEach((u) => URL.revokeObjectURL(u));
    } catch {
      upsert([{ ...message, state: "failed", pendingUploads: uploads }]);
    }
  }

  function onSend(input: ComposerSendInput) {
    const clientId = crypto.randomUUID();
    const optimisticAttachments: MessageAttachment[] = input.previews.map((p, i) => ({
      id: `${clientId}-${i}`,
      kind: p.kind,
      fileName: p.fileName,
      mimeType: p.mimeType,
      sizeBytes: p.size,
      width: input.attachments[i]?.width ?? null,
      height: input.attachments[i]?.height ?? null,
      url: p.previewUrl,
      downloadUrl: null,
    }));
    const optimistic: LocalMessage = {
      id: clientId,
      clientId,
      conversationId: conversation.id,
      senderId: viewerId,
      body: input.body,
      createdAt: new Date().toISOString(),
      attachments: optimisticAttachments,
    };
    void deliver(
      optimistic,
      input.attachments,
      input.previews.map((p) => p.previewUrl).filter((u): u is string => Boolean(u)),
    );
  }

  function onTyping() {
    const now = Date.now();
    if (channel && status === "live" && now - lastTypingSent.current > 2500) {
      lastTypingSent.current = now;
      void channel.send({ type: "broadcast", event: "typing", payload: { user_id: viewerId } });
    }
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.state);
    if (!oldest) return;
    try {
      const page = await api<{ items: MessageView[]; hasMore: boolean }>(
        `/api/v1/conversations/${conversation.id}/messages?before=${encodeURIComponent(oldest.createdAt)}&limit=30`,
      );
      upsert(page.items);
      setHasMore(page.hasMore);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link href="/messages" className="rounded-full p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-5" />
        </Link>
        <MemberLink member={conversation.other} size={38} subtitle={otherTyping ? "typing…" : (conversation.other.headline ?? undefined)} />
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {status === "degraded" ? "Offline — messages will sync when reconnected" : null}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5 sm:px-4" aria-live="polite" aria-relevant="additions">
        {hasMore ? (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" onClick={loadOlder}>
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">Say hello. Messages are private between you two.</p> : null}
        {messages.map((m, idx) => {
          const own = m.senderId === viewerId;
          const prev = messages[idx - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = !newDay && prev?.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          const read =
            own &&
            !m.state &&
            conversation.readReceipts &&
            (m.readByOthers === true || (otherReadAt !== null && m.createdAt <= otherReadAt));
          return (
            <div key={m.clientId}>
              {newDay ? (
                <p className="my-4 text-center text-[11px] font-medium tracking-wide text-muted uppercase">{dayLabel(m.createdAt)}</p>
              ) : null}
              <div className={cn("flex flex-col", own ? "items-end" : "items-start", grouped ? "mt-0.5" : "mt-3")}>
                {m.attachments.length ? (
                  <div className={cn("mb-1", m.state === "sending" && "opacity-70")}>
                    <MessageAttachments attachments={m.attachments} own={own} />
                  </div>
                ) : null}
                <div className={cn("group/msg flex max-w-full items-center gap-1", own ? "flex-row-reverse" : "flex-row")}>
                  {m.body ? (
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-6 whitespace-pre-line break-words sm:max-w-[75%]",
                        own ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md bg-surface-2",
                        m.state === "failed" && "opacity-60",
                      )}
                    >
                      {m.body}
                    </div>
                  ) : null}
                  {!m.state ? (
                    <div className="opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100">
                      <QuickReact
                        messageId={m.id}
                        current={m.reactions ?? []}
                        onReacted={(next) => setReactions(m.id, () => next)}
                        align={own ? "end" : "start"}
                      />
                    </div>
                  ) : null}
                </div>
                {!m.state ? (
                  <MessageReactions
                    messageId={m.id}
                    reactions={m.reactions ?? []}
                    mine={own}
                    onChange={(next) => setReactions(m.id, () => next)}
                  />
                ) : null}
                <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted">
                  {m.state === "sending" ? (
                    <>
                      <Clock className="size-3" aria-hidden="true" /> Sending…
                    </>
                  ) : m.state === "failed" ? (
                    <button
                      type="button"
                      onClick={() => deliver(m, m.pendingUploads ?? [], [])}
                      className="inline-flex items-center gap-1 text-danger hover:underline"
                    >
                      <AlertCircle className="size-3" /> Not sent — retry
                    </button>
                  ) : (
                    <>
                      <time dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                        {TIME.format(new Date(m.createdAt))}
                      </time>
                      {own ? (
                        read ? (
                          <span className="inline-flex items-center text-accent" title="Read">
                            <CheckCheck className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Read</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center" title="Delivered">
                            <Check className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Delivered</span>
                          </span>
                        )
                      ) : null}
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {conversation.canSend ? (
        <Composer
          conversationId={conversation.id}
          placeholder={`Message ${conversation.other.displayName}`}
          onSend={onSend}
          onTyping={onTyping}
          emojiPicker={EmojiPicker}
        />
      ) : (
        <p className="border-t border-border p-4 text-center text-sm text-muted">
          You can no longer message this member. Their privacy settings or a block may prevent it.
        </p>
      )}
    </div>
  );
}
