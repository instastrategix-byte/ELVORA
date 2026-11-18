import { getMetrics } from "@backend/modules/advertising";
import { metricsQuerySchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

/** Measured metrics for an account (JSON). The CSV export lives at ./export. */
export const GET = route({ name: "ads_manager.analytics", query: metricsQuerySchema, rateLimitPerMinute: 60 }, async ({ session, query }) =>
  getMetrics(session.db, query),
);
