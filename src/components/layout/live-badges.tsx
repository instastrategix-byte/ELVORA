"use client";

import { Bell, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/lib/realtime";

/**
 * Unread counters for the header. Initial values are server-rendered; realtime events on the
 * private `user:<id>` topic nudge them, and every (re)subscribe reconciles from the API.
 */
export function LiveBadges({ userId, initialNotifications, initialMessages }: { userId: string; initialNotifications: number; initialMessages: number }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [messages, setMessages] = useState(initialMessages);

  const sync = useCallback(() => {
    api<{ unread: number }>("/api/v1/notifications?countOnly=1")
      .then((r) => setNotifications(r.unread))
      .catch(() => undefined);
    api<{ unreadCount: number }[]>("/api/v1/conversations")
      .then((rows) => setMessages(rows.filter((r) => r.unreadCount > 0).length))
      .catch(() => undefined);
  }, []);

  useRealtime(
    `user:${userId}`,
    {
      "notification.created": () => setNotifications((n) => n + 1),
      "inbox.updated": () => sync(),
    },
    sync,
  );

  return (
    <>
      <IconLink href="/messages" label="Messages" count={messages} icon={<MessageSquare className="size-[18px]" />} />
      <IconLink href="/notifications" label="Notifications" count={notifications} icon={<Bell className="size-[18px]" />} />
    </>
  );
}

function IconLink({ href, label, count, icon }: { href: string; label: string; count: number; icon: React.ReactNode }) {
  return (
    <Link href={href} className="relative inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
      {icon}
      <span className="sr-only">
        {label}
        {count > 0 ? `, ${count} unread` : ""}
      </span>
      {count > 0 ? (
        <span aria-hidden="true" className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-fg">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
