import { reelCommentSchema, reelCommentsQuery } from "@backend/modules/reels/schemas";
import { addReelComment, listReelComments } from "@backend/modules/reels/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "reels.comments.list", params: idParams, query: reelCommentsQuery, rateLimitPerMinute: 120 }, async ({ session, params, query }) =>
  listReelComments(session.db, session.viewer, params.id, query.before),
);

export const POST = route(
  { name: "reels.comments.create", params: idParams, body: reelCommentSchema, feature: "feed.post", rateLimitPerMinute: 30 },
  async ({ session, params, body }) => addReelComment(session.db, session.viewer, params.id, body.body),
);
