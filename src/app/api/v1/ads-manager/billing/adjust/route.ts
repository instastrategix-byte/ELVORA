import { adjustBalance, adjustSchema } from "@backend/modules/advertising/billing/service";
import { route } from "@backend/http/route";

/** Staff balance adjustment (admin). Audited in SQL. */
export const POST = route({ name: "ads.billing.adjust", staff: "admin", body: adjustSchema, rateLimitPerMinute: 20 }, async ({ session, body }) =>
  adjustBalance(session.db, body),
);
