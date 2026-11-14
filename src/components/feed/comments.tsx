"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { Page } from "@/lib/pagination";
import type { CommentView } from "@backend/modules/feed/types";

export function Comments({ postId, canComment, onCountChange }: { postId: string; canComment: boolean; onCountChange: (delta: number) => void }) {
  const [items, setItems] = useState<CommentView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const load = useCallback(
    async (next?: string) => {
      setError(null);
      try {
        const page = await api<Page<CommentView>>(`/api/v1/posts/${postId}/comments${next ? `?cursor=${encodeURIComponent(next)}` : ""}`);
        setItems((prev) => (next && prev ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [postId],
  );

  useEffect(() => {
    let active = true;
    api<Page<CommentView>>(`/api/v1/posts/${postId}/comments`)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [postId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const created = await api<CommentView>(`/api/v1/posts/${postId}/comments`, { method: "POST", body: { body } });
      setItems((prev) => [created, ...(prev ?? [])]);
      setDraft("");
      onCountChange(1);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/v1/comments/${id}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onCountChange(-1);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <section aria-label="Comments" className="mt-4 space-y-4 border-t border-border pt-4">
      {canComment ? (
        <form onSubmit={submit} className="flex items-start gap-2">
          <label htmlFor={`c-${postId}`} className="sr-only">
            Write a comment
          </label>
          <Textarea id={`c-${postId}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Add a comment…" className="min-h-11 py-2.5" />
          <Button type="submit" size="sm" className="mt-1.5" disabled={sending || !draft.trim()}>
            {sending ? "…" : "Post"}
          </Button>
        </form>
      ) : null}
      {error ? <Alert tone="error" action={<Button size="sm" variant="outline" onClick={() => load()}>Retry</Button>}>{error}</Alert> : null}
      {items === null && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : null}
      {items?.length === 0 ? <p className="text-sm text-muted">No comments yet.</p> : null}
      <ul className="space-y-4">
        {items?.map((c) => (
          <li key={c.id} className="flex gap-3">
            <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <MemberLink member={c.author} size={28} subtitle={formatRelative(c.createdAt)} />
                {c.canDelete ? (
                  <button type="button" onClick={() => remove(c.id)} className="text-muted hover:text-danger" aria-label="Delete comment">
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-sm whitespace-pre-line break-words">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button variant="link" size="sm" onClick={() => load(cursor)}>
          Show older comments
        </Button>
      ) : null}
    </section>
  );
}
