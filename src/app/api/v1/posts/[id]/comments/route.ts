import { z } from "zod";
import { commentSchema } from "@backend/modules/feed/schemas";
import { addComment, listComments } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route(
  { name: "comments.list", params: idParams, query: z.object({ cursor: z.string().max(200).optional() }) },
  async ({ session, params, query }) => listComments(session.db, session.viewer, params.id, query.cursor),
);

export const POST = route(
  { name: "comments.create", feature: "feed.post", params: idParams, body: commentSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => addComment(session.db, session.viewer, params.id, body),
);
