import { createPostSchema } from "@backend/modules/feed/schemas";
import { createPost } from "@backend/modules/feed/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "posts.create", feature: "feed.post", body: createPostSchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => createPost(session.db, session.viewer, body),
);
