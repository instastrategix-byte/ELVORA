"use client";

import { AlertCircle, ArrowLeft, Check, CheckCheck, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { MESSAGE_MAX_LENGTH } from "@backend/modules/messaging/schemas";
import type { ConversationDetail, MessageView } from "@backend/modules/messaging/types";

type LocalMessage = MessageView & { state?: "sending" | "failed" };

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
  const [draft, setDraft] = useState("");
  const [otherReadAt, setOtherReadAt] = useState(conversation.otherLastReadAt);
  const [otherTyping, setOtherTyping] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const upsert = useCallback((incoming: LocalMessage[]) => {
    setMessages((prev) => {
      const byKey = new Map(prev.map((m) => [m.clientId, m]));
      for (const m of incoming) byKey.set(m.clientId, { ...byKey.get(m.clientId), ...m, state: m.state });
      return [...byKey.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
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
        };
        upsert([m]);
        if (m.senderId !== viewerId) {
          setOtherTyping(false);
          markRead();
        }
      },
      "conversation.read": (p) => {
        if (p.user_id !== viewerId && typeof p.last_read_at === "string") setOtherReadAt(p.last_read_at);
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

  async function send(body: string, clientId: string) {
    const optimistic: LocalMessage = {
      id: clientId,
      clientId,
      conversationId: conversation.id,
      senderId: viewerId,
      body,
      createdAt: new Date().toISOString(),
      state: "sending",
    };
    upsert([optimistic]);
    try {
      const saved = await api<MessageView>(`/api/v1/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: { body, clientId },
      });
      upsert([{ ...saved, state: undefined }]);
    } catch {
      upsert([{ ...optimistic, state: "failed" }]);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    void send(body, crypto.randomUUID());
  }

  function onType(value: string) {
    setDraft(value);
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

  const lastOwnRead = [...messages].reverse().find((m) => m.senderId === viewerId && !m.state && otherReadAt && m.createdAt <= otherReadAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link href="/messages" className="rounded-full p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-5" />
        </Link>
        <MemberLink member={conversation.other} size={38} subtitle={otherTyping ? "typing…" : conversation.other.headline ?? undefined} />
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {status === "degraded" ? "Offline — messages will sync when reconnected" : null}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5" aria-live="polite" aria-relevant="additions">
        {hasMore ? (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={loadOlder}>
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">Say hello. Messages are private between you two.</p> : null}
        {messages.map((m) => {
          const own = m.senderId === viewerId;
          return (
            <div key={m.clientId} className={cn("flex flex-col", own ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-6 whitespace-pre-line break-words",
                  own ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md bg-surface-2",
                  m.state === "failed" && "opacity-60",
                )}
              >
                {m.body}
              </div>
              <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                {m.state === "sending" ? (
                  "Sending…"
                ) : m.state === "failed" ? (
                  <button type="button" onClick={() => send(m.body, m.clientId)} className="inline-flex items-center gap-1 text-danger hover:underline">
                    <AlertCircle className="size-3" /> Not sent — retry
                  </button>
                ) : (
                  <>
                    <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                    {own ? (
                      lastOwnRead?.clientId === m.clientId ? (
                        <span className="inline-flex items-center gap-0.5 text-accent">
                          <CheckCheck className="size-3" aria-hidden="true" /> Read
                        </span>
                      ) : (
                        <Check className="size-3" aria-label="Delivered" />
                      )
                    ) : null}
                  </>
                )}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {conversation.canSend ? (
        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
          <label htmlFor="message-input" className="sr-only">
            Message {conversation.other.displayName}
          </label>
          <Textarea
            id="message-input"
            value={draft}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={1}
            placeholder="Write a message…"
            className="max-h-40 min-h-11 resize-none py-2.5"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message">
            <Send />
          </Button>
        </form>
      ) : (
        <p className="border-t border-border p-4 text-center text-sm text-muted">
          You can no longer message this member. Their privacy settings or a block may prevent it.
        </p>
      )}
    </div>
  );
}
