import { deleteAd, updateAd } from "@backend/modules/advertising";
import { adUpdateSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route(
  { name: "ads_manager.ads.update", params: idParams, body: adUpdateSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => updateAd(session.db, params.id, body),
);

export const DELETE = route({ name: "ads_manager.ads.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteAd(session.db, params.id);
  return { ok: true };
});
