import { setLike } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "posts.like", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) =>
  setLike(session.db, session.viewer, params.id, true),
);

export const DELETE = route({ name: "posts.unlike", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) =>
  setLike(session.db, session.viewer, params.id, false),
);
