import { createReelSchema, reelFeedQuery } from "@backend/modules/reels/schemas";
import { createReel, listReelFeed, listReelsByAuthor } from "@backend/modules/reels/service";
import { route } from "@backend/http/route";

/** The ranked reels feed, or one member's reels with ?author=<id>. */
export const GET = route({ name: "reels.list", query: reelFeedQuery, rateLimitPerMinute: 120 }, async ({ session, query }) =>
  query.author ? listReelsByAuthor(session.db, session.viewer, query.author, query.before) : listReelFeed(session.db, session.viewer, query.exclude),
);

/** Publishes a reel from files already uploaded through /api/v1/uploads. */
export const POST = route(
  { name: "reels.create", feature: "feed.post", body: createReelSchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => createReel(session.db, session.viewer, body),
);
