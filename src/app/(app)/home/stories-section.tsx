import { StoryRail } from "@/components/stories/story-rail";
import { attempt } from "@/lib/attempt";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listStoryRail } from "@backend/modules/stories/service";
import { requirePageSession } from "@backend/auth/viewer";

/** Stories rail. Renders nothing if stories can't load, rather than a broken strip above the feed. */
export async function StoriesSection() {
  const { viewer, db } = await requirePageSession({ next: "/home" });
  const canPost = hasFeature(viewer, "feed.post");
  const result = await attempt(() => listStoryRail(db, viewer));
  if (!result.ok) return null;
  if (result.data.length === 0 && !canPost) return null;
  return <StoryRail groups={result.data} canPost={canPost} />;
}
