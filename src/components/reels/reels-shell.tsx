import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ReelView } from "@backend/modules/reels/types";
import { ReelFeed } from "./reel-feed";

/** Page frame for the reels player: title, create button and the feed. */
export function ReelsShell({
  canPost,
  initial,
  hasMore,
  openCommentsFor,
}: {
  canPost: boolean;
  initial: ReelView[];
  hasMore: boolean;
  openCommentsFor?: string;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="display text-2xl">Reels</h1>
        {canPost ? (
          <Button asChild size="sm">
            <Link href="/reels/new">
              <Plus /> Create
            </Link>
          </Button>
        ) : null}
      </div>
      <ReelFeed initial={initial} initialHasMore={hasMore} canInteract openCommentsFor={openCommentsFor} emptyAction={canPost} />
    </div>
  );
}
