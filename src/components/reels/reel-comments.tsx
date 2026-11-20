"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { Alert, Avatar, Spinner } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { REEL_MAX_COMMENT, type ReelComment } from "@backend/modules/reels/types";

type Page = { items: ReelComment[]; hasMore: boolean };

export function ReelComments({
  reelId,
  canInteract,
  onClose,
  onCountChange,
}: {
  reelId: string;
  canInteract: boolean;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}) {
  const [items, setItems] = useState<ReelComment[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Page>(`/api/v1/reels/${reelId}/comments`)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [reelId]);

  async function loadMore() {
    const oldest = items?.at(-1);
    if (!oldest) return;
    try {
      const page = await api<Page>(`/api/v1/reels/${reelId}/comments?before=${encodeURIComponent(oldest.createdAt)}`);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const comment = await api<ReelComment>(`/api/v1/reels/${reelId}/comments`, { method: "POST", body: { body: text } });
      setItems((prev) => [comment, ...(prev ?? [])]);
      setBody("");
      onCountChange(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/v1/reels/${reelId}/comments/${id}`, { method: "DELETE" });
      setItems((prev) => (prev ?? []).filter((c) => c.id !== id));
      onCountChange(-1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent title="Comments">
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="max-h-[50dvh] space-y-4 overflow-y-auto pr-1">
            {items === null && !error ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : items?.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">No comments yet.{canInteract ? " Start the conversation." : ""}</p>
            ) : (
              <ul className="space-y-4">
                {items?.map((c) => (
                  <li key={c.id} className="group flex gap-3">
                    <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <Link href={`/members/${c.author.handle}`} className="font-semibold hover:text-accent">
                          {c.author.displayName}
                        </Link>{" "}
                        <span className="text-xs text-muted">{formatRelative(c.createdAt)}</span>
                      </p>
                      <p className="text-sm leading-6 whitespace-pre-line break-words">{c.body}</p>
                    </div>
                    {c.canDelete ? (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="self-start rounded-full p-1.5 text-muted opacity-100 hover:bg-surface-2 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {hasMore ? (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadMore}>
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
          {canInteract ? (
            <form onSubmit={submit} className="flex items-end gap-2">
              <label htmlFor="reel-comment" className="sr-only">
                Add a comment
              </label>
              <Textarea
                id="reel-comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={REEL_MAX_COMMENT}
                rows={1}
                placeholder="Add a comment…"
                className="min-h-10 flex-1 resize-none"
              />
              <Button type="submit" disabled={posting || !body.trim()}>
                {posting ? "Posting…" : "Post"}
              </Button>
            </form>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
