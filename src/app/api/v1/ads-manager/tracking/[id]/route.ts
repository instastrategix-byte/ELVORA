import { deleteIntegration, integrationUpdateSchema, updateIntegration } from "@backend/modules/advertising/tracking/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route({ name: "ads.tracking.update", params: idParams, body: integrationUpdateSchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) => {
  await updateIntegration(session.db, params.id, body);
  return { ok: true };
});

export const DELETE = route({ name: "ads.tracking.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteIntegration(session.db, params.id);
  return { ok: true };
});
