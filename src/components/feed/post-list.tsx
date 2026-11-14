"use client";

import { Newspaper } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import type { Page } from "@/lib/pagination";
import type { PostView } from "@backend/modules/feed/types";
import { PostCard } from "./post-card";
import { PostComposer } from "./post-composer";

/**
 * Feed with keyset pagination. `endpoint` must return Page<PostView> and accept `cursor`.
 */
export function PostList({
  initial,
  endpoint,
  canInteract,
  composer,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  header,
}: {
  initial: Page<PostView>;
  endpoint: string | null;
  canInteract: boolean;
  composer?: { authorName: string; avatarUrl: string | null };
  emptyTitle?: string;
  emptyDescription?: string;
  header?: React.ReactNode;
}) {
  const [posts, setPosts] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || !endpoint) return;
    setLoading(true);
    setError(null);
    try {
      const sep = endpoint.includes("?") ? "&" : "?";
      const page = await api<Page<PostView>>(`${endpoint}${sep}cursor=${encodeURIComponent(cursor)}`);
      setPosts((prev) => [...prev, ...page.items.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {composer ? <PostComposer {...composer} onCreated={(p) => setPosts((prev) => [p, ...prev])} /> : null}
      {header}
      {posts.length === 0 ? (
        <EmptyState icon={<Newspaper />} title={emptyTitle} description={emptyDescription} />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} canInteract={canInteract} onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />)
      )}
      {error ? <Alert tone="error" action={<Button size="sm" variant="outline" onClick={loadMore}>Retry</Button>}>{error}</Alert> : null}
      {cursor && endpoint && !error ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
