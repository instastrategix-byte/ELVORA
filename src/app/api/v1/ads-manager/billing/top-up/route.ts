import { startTopUp, topUpSchema } from "@backend/modules/advertising/billing/service";
import { route } from "@backend/http/route";

/** Starts a Stripe Checkout for an advertising balance top-up (account admin+). */
export const POST = route({ name: "ads.billing.top_up", body: topUpSchema, rateLimitPerMinute: 10 }, async ({ session, body }) =>
  startTopUp(session.db, session.viewer, body),
);
