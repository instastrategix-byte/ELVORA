"use client";

import { MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { ConnectionTab, ConnectionView } from "@backend/modules/connections/service";
import { MemberLink } from "./member-card";

export function ConnectionList({ tab, initial }: { tab: ConnectionTab; initial: ConnectionView[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function act(id: string, fn: () => Promise<unknown>, success: string) {
    setBusyId(id);
    try {
      await fn();
      setItems((prev) => prev.filter((c) => c.id !== id));
      toast.show(success);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function message(userId: string) {
    try {
      const { id } = await api<{ id: string }>("/api/v1/conversations", { method: "POST", body: { userId } });
      router.push(`/messages/${id}`);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  if (items.length === 0) {
    const copy = {
      connections: { title: "No connections yet", description: "Find people you know in Discover and send a considered request." },
      received: { title: "No pending requests", description: "Requests sent to you will appear here." },
      sent: { title: "No sent requests", description: "Requests you send stay here until they're answered." },
    }[tab];
    return (
      <EmptyState
        icon={<Users />}
        {...copy}
        action={
          tab === "connections" ? (
            <Button asChild variant="outline">
              <Link href="/discover">Discover members</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <MemberLink member={c.other} size={44} subtitle={c.other.headline ?? formatRelative(c.createdAt)} />
            {c.message ? <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">“{c.message}”</p> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {tab === "received" ? (
              <>
                <Button size="sm" disabled={busyId === c.id} onClick={() => act(c.id, () => api(`/api/v1/connections/${c.id}`, { method: "PATCH", body: { accept: true } }), "Connection accepted")}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, () => api(`/api/v1/connections/${c.id}`, { method: "PATCH", body: { accept: false } }), "Request declined")}>
                  Decline
                </Button>
              </>
            ) : tab === "sent" ? (
              <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, () => api(`/api/v1/connections/${c.id}`, { method: "DELETE" }), "Request withdrawn")}>
                Withdraw
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => message(c.other.id)}>
                  <MessageSquare /> Message
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === c.id}
                  onClick={() => {
                    if (window.confirm(`Remove ${c.other.displayName} from your connections?`)) {
                      void act(c.id, () => api(`/api/v1/connections/${c.id}`, { method: "DELETE" }), "Connection removed");
                    }
                  }}
                >
                  Remove
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
