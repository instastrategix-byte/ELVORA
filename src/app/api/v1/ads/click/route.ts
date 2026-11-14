import { clickSchema } from "@backend/modules/ads/schemas";
import { recordClick } from "@backend/modules/ads/service";
import { route } from "@backend/http/route";

/** Records one click per impression and returns the server-resolved destination. */
export const POST = route({ name: "ads.click", body: clickSchema, rateLimitPerMinute: 30 }, async ({ session, body }) =>
  recordClick(session.db, body.impressionId),
);
