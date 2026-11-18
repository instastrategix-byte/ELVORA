"use client";

import { MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { Page } from "@/lib/pagination";
import { useAction } from "@/lib/use-action";
import type { ReplyView } from "@backend/modules/communities/types";

/** Replies, oldest first, with "load more", a reply box for members and delete for authors/moderators. */
export function Replies({
  threadId,
  initial,
  canReply,
  canModerate,
  lockedReason,
}: {
  threadId: string;
  initial: Page<ReplyView>;
  canReply: boolean;
  canModerate: boolean;
  lockedReason?: string | null;
}) {
  const [replies, setReplies] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [draft, setDraft] = useState("");
  const more = useAction(() => api<Page<ReplyView>>(`/api/v1/community-threads/${threadId}/replies?cursor=${encodeURIComponent(cursor ?? "")}`));
  const post = useAction((body: string) => api<ReplyView>(`/api/v1/community-threads/${threadId}/replies`, { method: "POST", body: { body } }));
  const toast = useToast();

  async function loadMore() {
    const page = await more.run();
    if (!page) return;
    setReplies((prev) => [...prev, ...page.items.filter((r) => !prev.some((x) => x.id === r.id))]);
    setCursor(page.nextCursor);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const reply = await post.run(body);
    if (!reply) return;
    setDraft("");
    // Only append when everything earlier is loaded; otherwise it appears when paging reaches it.
    if (!cursor) setReplies((prev) => [...prev, reply]);
    toast.show("Reply posted");
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this reply?")) return;
    try {
      await api(`/api/v1/community-replies/${id}`, { method: "DELETE" });
      setReplies((prev) => prev.filter((r) => r.id !== id));
      toast.show("Reply deleted");
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <section aria-labelledby="replies-h" className="space-y-4">
      <h2 id="replies-h" className="text-sm font-semibold tracking-wide">
        Replies
      </h2>
      {replies.length === 0 ? (
        <EmptyState icon={<MessageCircle />} title="No replies yet" description={canReply ? "Share your perspective to start the conversation." : undefined} />
      ) : (
        <ol className="space-y-3">
          {replies.map((r) => (
            <li key={r.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <MemberLink member={r.author} size={34} subtitle={<time dateTime={r.createdAt}>{formatRelative(r.createdAt)}</time>} />
                {r.isOwn || canModerate ? (
                  <button type="button" onClick={() => remove(r.id)} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Delete reply">
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-[15px] leading-7 whitespace-pre-line break-words">{r.body}</p>
            </li>
          ))}
        </ol>
      )}
      {more.error ? <Alert tone="error">{more.error}</Alert> : null}
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={more.pending}>
            {more.pending ? "Loading…" : "Load more replies"}
          </Button>
        </div>
      ) : null}

      {canReply ? (
        <form onSubmit={submit} className="panel space-y-3 p-4" aria-label="Reply">
          <label htmlFor="reply-body" className="sr-only">
            Your reply
          </label>
          <Textarea id="reply-body" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={3000} placeholder="Write a reply…" className="min-h-24" />
          {post.error ? <Alert tone="error">{post.error}</Alert> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={post.pending || !draft.trim()}>
              {post.pending ? "Posting…" : "Reply"}
            </Button>
          </div>
        </form>
      ) : lockedReason ? (
        <p className="text-sm text-muted">{lockedReason}</p>
      ) : null}
    </section>
  );
}
