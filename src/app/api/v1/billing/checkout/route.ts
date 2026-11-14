import { checkoutSchema } from "@backend/modules/membership/schemas";
import { startCheckout } from "@backend/modules/billing/service";
import { route } from "@backend/http/route";

/** Returns a hosted checkout URL. Membership is activated only by the provider webhook. */
export const POST = route(
  { name: "billing.checkout", body: checkoutSchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => startCheckout(session.db, session.viewer, body),
);
