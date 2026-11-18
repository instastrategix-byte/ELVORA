import { deleteCreative, updateCreative } from "@backend/modules/advertising";
import { creativeUpdateSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Editing an approved creative sends it (and its ads) back to review. */
export const PATCH = route(
  { name: "ads_manager.creatives.update", params: idParams, body: creativeUpdateSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await updateCreative(session.db, params.id, body);
    return { ok: true };
  },
);

export const DELETE = route({ name: "ads_manager.creatives.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteCreative(session.db, params.id);
  return { ok: true };
});
