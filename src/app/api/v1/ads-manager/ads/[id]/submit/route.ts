import { submitAd } from "@backend/modules/advertising";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Sends an ad added to a running campaign for review. */
export const POST = route({ name: "ads_manager.ads.submit", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await submitAd(session.db, params.id);
  return { ok: true };
});
