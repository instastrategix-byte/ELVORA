import { revokeReferral } from "@backend/modules/referrals/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const DELETE = route({ name: "referrals.revoke", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await revokeReferral(session.db, params.id);
  return { ok: true };
});
