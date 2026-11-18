import { setRepost } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "posts.repost", params: idParams, feature: "feed.post", rateLimitPerMinute: 60 }, async ({ session, params }) =>
  setRepost(session.db, session.viewer, params.id, true),
);

export const DELETE = route({ name: "posts.unrepost", params: idParams, rateLimitPerMinute: 60 }, async ({ session, params }) =>
  setRepost(session.db, session.viewer, params.id, false),
);
