import { deleteAudience, updateAudience } from "@backend/modules/advertising";
import { audienceUpdateSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route(
  { name: "ads_manager.audiences.update", params: idParams, body: audienceUpdateSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => updateAudience(session.db, params.id, body),
);

export const DELETE = route({ name: "ads_manager.audiences.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteAudience(session.db, params.id);
  return { ok: true };
});
