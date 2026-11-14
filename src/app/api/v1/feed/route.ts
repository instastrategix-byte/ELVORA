import { feedQuerySchema } from "@backend/modules/feed/schemas";
import { listFeed } from "@backend/modules/feed/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "feed.list", query: feedQuerySchema }, async ({ session, query }) =>
  listFeed(session.db, session.viewer, { scope: query.scope, cursor: query.cursor }),
);
