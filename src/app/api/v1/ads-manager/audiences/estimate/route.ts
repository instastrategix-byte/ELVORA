import { estimateAudience } from "@backend/modules/advertising";
import { estimateSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

/** Rounded audience size (null below 100 members). Rate limited to discourage probing. */
export const POST = route({ name: "ads_manager.audiences.estimate", body: estimateSchema, rateLimitPerMinute: 20 }, async ({ session, body }) =>
  estimateAudience(session.db, body),
);
