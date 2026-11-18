import { getMetrics, metricsToCsv } from "@backend/modules/advertising";
import { metricsQuerySchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

const GROUP_LABELS = { day: "Date", campaign: "Campaign", ad_set: "Ad set", ad: "Ad", placement: "Placement" } as const;

/** CSV export of the same measured report. */
export const GET = route({ name: "ads_manager.analytics.export", query: metricsQuerySchema, rateLimitPerMinute: 20 }, async ({ session, query }) => {
  const report = await getMetrics(session.db, query);
  return new Response(metricsToCsv(report, GROUP_LABELS[query.group]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="elvora-ads-${query.from}-to-${query.to}-by-${query.group}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});
