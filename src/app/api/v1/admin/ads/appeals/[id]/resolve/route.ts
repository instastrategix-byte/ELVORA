import { resolveAppeal } from "@backend/modules/advertising";
import { resolveAppealSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.ads.appeal_resolve", staff: "moderator", params: idParams, body: resolveAppealSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await resolveAppeal(session.db, params.id, body);
    return { ok: true };
  },
);
