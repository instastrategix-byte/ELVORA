import { cursorQuerySchema, replySchema } from "@backend/modules/communities/schemas";
import { createReply, listReplies } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "threads.replies", params: idParams, query: cursorQuerySchema, rateLimitPerMinute: 120 }, async ({ session, params, query }) =>
  listReplies(session.db, session.viewer, params.id, query.cursor),
);

/** Members only, and never on a locked discussion (RLS). */
export const POST = route({ name: "threads.reply", params: idParams, body: replySchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) =>
  createReply(session.db, session.viewer, params.id, body.body),
);
