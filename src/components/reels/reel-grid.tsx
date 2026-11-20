"use client";

import { Clapperboard, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { compactCount, type ReelView } from "@backend/modules/reels/types";

type Page = { items: ReelView[]; hasMore: boolean };

/** A member's reels as a poster grid (loaded on demand, e.g. when the profile's Reels tab opens). */
export function ReelGrid({ authorId, isSelf }: { authorId: string; isSelf: boolean }) {
  const [items, setItems] = useState<ReelView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Page>(`/api/v1/reels?author=${authorId}`)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  async function loadMore() {
    const last = items?.at(-1);
    if (!last) return;
    try {
      const page = await api<Page>(`/api/v1/reels?author=${authorId}&before=${encodeURIComponent(last.createdAt)}`);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (items === null) {
    return (
      <div className="grid grid-cols-3 gap-1.5" aria-busy="true" aria-label="Loading reels">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Clapperboard />}
        title="No reels yet"
        description={isSelf ? "Share a short video with members." : "Reels you're allowed to see will appear here."}
        action={
          isSelf ? (
            <Button asChild>
              <Link href="/reels/new">
                <Plus /> Create a reel
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <ul className="stagger grid grid-cols-3 gap-1.5">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              href={`/reels/${r.id}`}
              className="group relative block aspect-[9/16] overflow-hidden rounded-xl bg-surface-2"
              aria-label={`Reel${r.caption ? `: ${r.caption.slice(0, 80)}` : ""}, ${r.viewCount} views`}
            >
              {r.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                <img src={r.posterUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <Clapperboard className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              )}
              <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-xs font-medium text-white drop-shadow">
                <Play className="size-3 fill-white" aria-hidden="true" /> {compactCount(r.viewCount)}
              </span>
              {r.status !== "published" ? (
                <span className="absolute top-1.5 left-1.5 rounded-full bg-danger px-2 py-0.5 text-[10px] font-medium text-white">{r.status}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
