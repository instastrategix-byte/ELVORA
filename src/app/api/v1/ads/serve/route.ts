import { serveQuerySchema } from "@backend/modules/ads/schemas";
import { serveAds } from "@backend/modules/ads/service";
import { route } from "@backend/http/route";

/**
 * Returns at most one sponsored item for a placement. Each returned item is a measured
 * impression recorded in the database at serve time (budget, schedule, frequency cap and
 * targeting enforced in SQL).
 */
export const GET = route({ name: "ads.serve", query: serveQuerySchema, rateLimitPerMinute: 30 }, async ({ session, query }) =>
  serveAds(session.db, query.placement),
);
