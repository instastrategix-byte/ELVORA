import { deleteAdSet, updateAdSet } from "@backend/modules/advertising";
import { adSetUpdateSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route(
  { name: "ads_manager.ad_sets.update", params: idParams, body: adSetUpdateSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => updateAdSet(session.db, params.id, body),
);

export const DELETE = route({ name: "ads_manager.ad_sets.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteAdSet(session.db, params.id);
  return { ok: true };
});
