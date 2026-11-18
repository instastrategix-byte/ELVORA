import { setCampaignSuspension } from "@backend/modules/advertising";
import { suspensionSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.ads.campaign_suspension", staff: "moderator", params: idParams, body: suspensionSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await setCampaignSuspension(session.db, params.id, body);
    return { ok: true };
  },
);
