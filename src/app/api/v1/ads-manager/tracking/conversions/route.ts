import { conversionSummary, conversionSummaryQuery } from "@backend/modules/advertising/tracking/service";
import { route } from "@backend/http/route";

/** Conversion totals by event (RLS limits rows to accounts the viewer belongs to). */
export const GET = route({ name: "ads.tracking.conversions", query: conversionSummaryQuery }, async ({ session, query }) =>
  conversionSummary(session.db, query),
);
