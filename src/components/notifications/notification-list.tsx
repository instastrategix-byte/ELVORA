"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Avatar, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative, titleCase } from "@/lib/format";
import type { Page } from "@/lib/pagination";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import type { NotificationView } from "@backend/modules/notifications/service";

function describe(n: NotificationView): { text: string; href: string | null } {
  const who = n.actor?.displayName ?? "Someone";
  const status = typeof n.payload.status === "string" ? titleCase(n.payload.status) : "";
  switch (n.type) {
    case "connection_request":
      return { text: `${who} sent you a connection request`, href: "/connections?tab=received" };
    case "connection_accepted":
      return { text: `${who} accepted your connection request`, href: n.actor?.handle ? `/members/${n.actor.handle}` : "/connections" };
    case "new_follower":
      return { text: `${who} started following you`, href: n.actor?.handle ? `/members/${n.actor.handle}` : null };
    case "post_liked":
      return { text: `${who} liked your post`, href: n.entityId ? `/posts/${n.entityId}` : null };
    case "post_commented":
      return { text: `${who} commented on your post`, href: n.entityId ? `/posts/${n.entityId}` : null };
    case "message":
      return { text: `New message from ${who}`, href: n.entityId ? `/messages/${n.entityId}` : "/messages" };
    case "membership_update":
      return { text: `Your membership status is now ${status}`, href: "/account/membership" };
    case "application_update":
      return { text: `Your membership application is ${status.toLowerCase()}`, href: "/account/membership" };
    case "verification_update":
      return { text: `Your verification request was ${status.toLowerCase()}`, href: "/account/verification" };
    case "moderation_notice":
      return { text: "A moderation action was applied to your account or content", href: "/account/settings" };
    case "listing_inquiry":
      return { text: `${who} sent an inquiry about your listing`, href: "/business/inquiries" };
    case "business_update":
      return { text: `Business review update: ${status}`, href: "/business" };
    case "campaign_update":
      return { text: `Campaign review update: ${status}`, href: n.entityId ? `/ads/campaigns/${n.entityId}` : "/ads" };
    default:
      return { text: "You have a new notification", href: null };
  }
}

export function NotificationList({ userId, initial }: { userId: string; initial: Page<NotificationView> }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const page = await api<Page<NotificationView>>("/api/v1/notifications");
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasNew(false);
    } catch {
      // keep current list; realtime is best-effort
    }
  }, []);

  const { status } = useRealtime(`user:${userId}`, { "notification.created": () => setHasNew(true) }, refresh);

  async function loadMore() {
    if (!cursor) return;
    try {
      const page = await api<Page<NotificationView>>(`/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function markAll() {
    try {
      await api("/api/v1/notifications", { method: "PATCH", body: { all: true } });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      toast.show("All caught up");
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  function markOne(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    void api("/api/v1/notifications", { method: "PATCH", body: { ids: [id] } }).catch(() => undefined);
  }

  const unread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted" aria-live="polite">
          {status === "live" ? "Live updates on" : status === "degraded" ? "Live updates unavailable — refresh to see new activity" : ""}
        </p>
        <Button variant="ghost" size="sm" onClick={markAll} disabled={!unread}>
          <CheckCheck /> Mark all as read
        </Button>
      </div>
      {hasNew ? (
        <Button variant="outline" className="w-full" onClick={refresh}>
          New notifications — show
        </Button>
      ) : null}
      {items.length === 0 ? (
        <EmptyState icon={<Bell />} title="You're all caught up" description="Connection requests, replies and account updates will appear here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((n) => {
            const { text, href } = describe(n);
            const inner = (
              <>
                <Avatar src={n.actor?.avatarUrl} name={n.actor?.displayName ?? "ELVORA"} size={40} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", !n.readAt && "font-medium")}>{text}</p>
                  <p className="text-xs text-muted">{formatRelative(n.createdAt)}</p>
                </div>
                {!n.readAt ? <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
              </>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} onClick={() => markOne(n.id)} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2">
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => markOne(n.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-2">
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore}>
            Load older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
