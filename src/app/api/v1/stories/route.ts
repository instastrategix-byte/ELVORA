import { createStorySchema } from "@backend/modules/stories/schemas";
import { createStory, listStoryRail } from "@backend/modules/stories/service";
import { route } from "@backend/http/route";

/** Active stories the viewer may see, grouped by author. */
export const GET = route({ name: "stories.list" }, async ({ session }) => listStoryRail(session.db, session.viewer));

export const POST = route(
  { name: "stories.create", feature: "feed.post", body: createStorySchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => createStory(session.db, session.viewer, body),
);
