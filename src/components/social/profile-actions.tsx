"use client";

import { Ban, MessageSquare, MoreHorizontal, UserCheck, UserPlus, UserMinus, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { Relationship } from "@backend/modules/profiles/types";
import { ReportButton } from "./report-button";

/**
 * Connection, follow, message and block actions. Every action is authorized server-side; this
 * component only reflects the relationship state the server returned.
 */
export function ProfileActions({
  userId,
  displayName,
  relationship,
  canConnect,
}: {
  userId: string;
  displayName: string;
  relationship: Relationship;
  canConnect: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const { connection } = relationship;

  async function act(fn: () => Promise<unknown>, success: string, refresh = true) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.show(success);
      if (refresh) router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/v1/conversations", { method: "POST", body: { userId } });
      router.push(`/messages/${id}`);
    } catch (e) {
      toast.show(errorMessage(e), "error");
      setBusy(false);
    }
  }

  if (relationship.blocked) {
    return (
      <Button variant="outline" disabled={busy} onClick={() => act(() => api(`/api/v1/blocks/${userId}`, { method: "DELETE" }), "Unblocked")}>
        Unblock
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {connection?.status === "accepted" ? (
        <Button variant="secondary" disabled>
          <UserCheck /> Connected
        </Button>
      ) : connection?.direction === "incoming" ? (
        <>
          <Button disabled={busy} onClick={() => act(() => api(`/api/v1/connections/${connection.id}`, { method: "PATCH", body: { accept: true } }), "Connection accepted")}>
            Accept request
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => act(() => api(`/api/v1/connections/${connection.id}`, { method: "PATCH", body: { accept: false } }), "Request declined")}>
            Decline
          </Button>
        </>
      ) : connection?.direction === "outgoing" ? (
        <Button variant="outline" disabled={busy} onClick={() => act(() => api(`/api/v1/connections/${connection.id}`, { method: "DELETE" }), "Request withdrawn")}>
          <Clock /> Pending · Withdraw
        </Button>
      ) : canConnect ? (
        <Button disabled={busy} onClick={() => setRequestOpen(true)}>
          <UserPlus /> Connect
        </Button>
      ) : null}

      {relationship.canMessage ? (
        <Button variant="outline" disabled={busy} onClick={message}>
          <MessageSquare /> Message
        </Button>
      ) : null}

      <Button
        variant="ghost"
        disabled={busy}
        aria-pressed={relationship.following}
        onClick={() =>
          act(
            () => api(`/api/v1/follows/${userId}`, { method: relationship.following ? "DELETE" : "POST" }),
            relationship.following ? "Unfollowed" : `Following ${displayName}`,
          )
        }
      >
        {relationship.following ? "Following" : "Follow"}
      </Button>

      <Menu>
        <MenuTrigger className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label="More actions">
          <MoreHorizontal className="size-5" />
        </MenuTrigger>
        <MenuContent>
          {connection?.status === "accepted" ? (
            <MenuItem onSelect={() => act(() => api(`/api/v1/connections/${connection.id}`, { method: "DELETE" }), "Connection removed")}>
              <UserMinus /> Remove connection
            </MenuItem>
          ) : null}
          <MenuItem
            onSelect={() => {
              if (window.confirm(`Block ${displayName}? You will no longer see each other's content or be able to message.`)) {
                void act(() => api(`/api/v1/blocks/${userId}`, { method: "POST" }), "Member blocked");
              }
            }}
            className="text-danger"
          >
            <Ban /> Block
          </MenuItem>
        </MenuContent>
      </Menu>
      <ReportButton targetType="profile" targetId={userId} />

      <ConnectDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        displayName={displayName}
        onSend={(note) =>
          act(async () => {
            await api("/api/v1/connections", { method: "POST", body: { userId, message: note || undefined } });
            setRequestOpen(false);
          }, "Connection request sent")
        }
        busy={busy}
      />
    </div>
  );
}

function ConnectDialog({
  open,
  onOpenChange,
  displayName,
  onSend,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  displayName: string;
  onSend: (note: string) => void;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Connect with ${displayName}`} description="A short, personal note makes a connection far more likely to be accepted.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend(String(new FormData(e.currentTarget).get("note") ?? "").trim());
          }}
          className="space-y-4"
        >
          <Field id="connect-note" label="Note" hint="Optional, up to 300 characters.">
            {(aria) => <Textarea name="note" maxLength={300} {...aria} />}
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
