"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Avatar, EmptyState } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@backend/modules/messaging/types";

export function ConversationList({ userId, initial, activeId }: { userId: string; initial: ConversationSummary[]; activeId?: string }) {
  const [items, setItems] = useState(initial);

  const refresh = useCallback(() => {
    api<ConversationSummary[]>("/api/v1/conversations")
      .then(setItems)
      .catch(() => undefined);
  }, []);

  useRealtime(`user:${userId}`, { "inbox.updated": refresh }, refresh);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        title="No conversations"
        description="Start a conversation from a connection's profile. Members choose who may message them."
        className="border-0"
      />
    );
  }

  return (
    <ul aria-label="Conversations" className="divide-y divide-border">
      {items.map((c) => {
        const unread = c.unreadCount > 0 && c.id !== activeId;
        return (
          <li key={c.id}>
            <Link
              href={`/messages/${c.id}`}
              aria-current={c.id === activeId ? "page" : undefined}
              className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2", c.id === activeId && "bg-surface-2")}
            >
              <Avatar src={c.other.avatarUrl} name={c.other.displayName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate text-sm", unread && "font-semibold")}>{c.other.displayName}</p>
                  {c.lastMessageAt ? <span className="shrink-0 text-xs text-muted">{formatRelative(c.lastMessageAt)}</span> : null}
                </div>
                <p className={cn("truncate text-sm", unread ? "text-fg" : "text-muted")}>
                  {c.lastMessageFromViewer ? "You: " : ""}
                  {c.lastMessagePreview ?? "No messages yet"}
                </p>
              </div>
              {unread ? (
                <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs leading-5 font-semibold text-accent-fg">
                  {c.unreadCount}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
