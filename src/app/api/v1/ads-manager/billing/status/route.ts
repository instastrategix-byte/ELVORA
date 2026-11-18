import { billingStatusSchema, setBillingStatus } from "@backend/modules/advertising/billing/service";
import { route } from "@backend/http/route";

/** Staff billing status change, e.g. suspending an account (admin). Audited in SQL. */
export const POST = route({ name: "ads.billing.status", staff: "admin", body: billingStatusSchema, rateLimitPerMinute: 20 }, async ({ session, body }) => {
  await setBillingStatus(session.db, body);
  return { ok: true };
});
