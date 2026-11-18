import { SponsoredSlot } from "@/components/ads/sponsored-slot";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostList } from "@/components/feed/post-list";
import { Alert } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { publicMediaUrl } from "@/lib/media";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listFeed } from "@backend/modules/feed/service";
import { requirePageSession } from "@backend/auth/viewer";
import { isAiConfigured } from "@backend/modules/ai/service";

/**
 * The dashboard's centre column: composer plus the member's network feed. A quiet network falls
 * back to the wider community so new members never land on an empty page.
 */
export async function FeedSection() {
  const { viewer, db } = await requirePageSession({ next: "/home" });
  const canPost = hasFeature(viewer, "feed.post");
  const network = await attempt(() => listFeed(db, viewer, { scope: "network" }));
  const quiet = network.ok && network.data.items.length === 0;
  const result = quiet ? await attempt(() => listFeed(db, viewer, { scope: "all" })) : network;
  if (!result.ok) return <ServiceNotice error={result.error} what="your feed" />;
  const scope = quiet ? "all" : "network";

  return (
    <div className="space-y-4">
      {!canPost ? <Alert tone="info">Posting isn&apos;t included in your current membership. You can still read, like and save posts.</Alert> : null}
      {quiet && result.data.items.length > 0 ? (
        <p className="px-1 text-xs text-muted">Your network is quiet, so here&apos;s what the community is sharing. Connect with members to personalise this feed.</p>
      ) : null}
      <PostList
        initial={result.data}
        endpoint={`/api/v1/feed?scope=${scope}`}
        canInteract
        composer={canPost ? { authorName: viewer.displayName, avatarUrl: publicMediaUrl("profile-media", viewer.avatarPath), aiEnabled: isAiConfigured() } : undefined}
        header={<SponsoredSlot placement="feed" />}
        emptyTitle="Start the conversation"
        emptyDescription="No one has posted yet. Share a perspective, an opportunity or a milestone to get things going."
      />
    </div>
  );
}
