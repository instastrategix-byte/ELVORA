import { decideCampaign } from "@backend/modules/advertising";
import { reviewDecisionSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.ads.campaign_review", staff: "moderator", params: idParams, body: reviewDecisionSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await decideCampaign(session.db, params.id, body);
    return { ok: true };
  },
);
