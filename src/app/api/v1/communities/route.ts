import { communityListQuerySchema, communitySchema } from "@backend/modules/communities/schemas";
import { createCommunity, listCommunities } from "@backend/modules/communities/service";
import { route } from "@backend/http/route";

/** Members-only. RLS limits results to communities the caller may see. */
export const GET = route({ name: "communities.list", query: communityListQuerySchema, rateLimitPerMinute: 120 }, async ({ session, query }) =>
  listCommunities(session.db, session.viewer, query),
);

/** The database checks posting rights, the 5-community limit, and makes the creator the owner. */
export const POST = route({ name: "communities.create", body: communitySchema, rateLimitPerMinute: 10 }, async ({ session, body }) =>
  createCommunity(session.db, session.viewer, body),
);
