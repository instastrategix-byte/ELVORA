import { cancelSubscription } from "@backend/modules/billing/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "billing.cancel", auth: "user", params: idParams, rateLimitPerMinute: 5 }, async ({ session, params }) =>
  cancelSubscription(session.db, session.viewer, params.id),
);
