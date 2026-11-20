"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Alert, Avatar, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@backend/modules/messaging/types";

/** Send a reel to up to 10 recent conversations, or copy its link. */
export function ReelShareDialog({
  reelId,
  canSend,
  onClose,
  onShared,
}: {
  reelId: string;
  canSend: boolean;
  onClose: () => void;
  onShared: (count: number) => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!canSend) return;
    let cancelled = false;
    api<ConversationSummary[]>("/api/v1/conversations")
      .then((list) => !cancelled && setConversations(list))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [canSend]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 10 ? prev : [...prev, id]));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(`/reels/${reelId}`, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the link. Copy it from the address bar instead.");
    }
  }

  async function send() {
    if (!selected.length || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await api<{ sent: number; failed: string[] }>(`/api/v1/reels/${reelId}/share`, {
        method: "POST",
        body: { conversationIds: selected, note: note.trim() || undefined },
      });
      onShared(r.sent);
      toast.show(r.failed.length ? `Sent to ${r.sent}. ${r.failed.length} couldn't be sent.` : `Sent to ${r.sent} ${r.sent === 1 ? "conversation" : "conversations"}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent title="Share reel" description="Only members who can see this reel will be able to watch it.">
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button variant="outline" onClick={copyLink} className="w-full">
            {copied ? <Check /> : <Link2 />} {copied ? "Link copied" : "Copy link"}
          </Button>
          {canSend ? (
            <>
              <p className="text-sm font-medium">Send in a message</p>
              {conversations === null && !error ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : conversations?.length === 0 ? (
                <p className="text-sm text-muted">You have no conversations yet. Start one from a member&apos;s profile.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Conversations">
                  {conversations?.map((c) => {
                    const on = selected.includes(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => toggle(c.id)}
                          aria-pressed={on}
                          className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2", on && "bg-surface-2")}
                        >
                          <Avatar src={c.other.avatarUrl} name={c.other.displayName} size={36} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.other.displayName}</span>
                          <span
                            className={cn("flex size-5 items-center justify-center rounded-full border border-border-strong", on && "border-accent bg-accent text-accent-fg")}
                            aria-hidden="true"
                          >
                            {on ? <Check className="size-3.5" /> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <label htmlFor="reel-share-note" className="sr-only">
                Add a message
              </label>
              <Input id="reel-share-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Add a message (optional)" />
              <Button onClick={send} disabled={!selected.length || sending} className="w-full">
                {sending ? "Sending…" : selected.length ? `Send to ${selected.length}` : "Send"}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
