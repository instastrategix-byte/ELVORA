import { markStoryViewed } from "@backend/modules/stories/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Marks a story as seen by the viewer. Idempotent. */
export const POST = route({ name: "stories.view", params: idParams, rateLimitPerMinute: 240 }, async ({ session, params }) => {
  await markStoryViewed(session.db, session.viewer, params.id);
  return { viewed: true };
});
