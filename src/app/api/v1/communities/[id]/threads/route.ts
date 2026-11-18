import { cursorQuerySchema, threadSchema } from "@backend/modules/communities/schemas";
import { createThread, listThreads } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "communities.threads", params: idParams, query: cursorQuerySchema, rateLimitPerMinute: 120 }, async ({ session, params, query }) =>
  listThreads(session.db, session.viewer, params.id, query.cursor),
);

/** Active members of a live community only (RLS). */
export const POST = route({ name: "communities.threads.create", params: idParams, body: threadSchema, rateLimitPerMinute: 10 }, async ({ session, params, body }) =>
  createThread(session.db, session.viewer, params.id, body),
);
