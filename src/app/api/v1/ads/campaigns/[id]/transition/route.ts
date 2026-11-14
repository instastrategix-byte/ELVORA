import { campaignActionSchema } from "@backend/modules/ads/schemas";
import { transitionCampaign } from "@backend/modules/ads/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Owner actions: submit, pause, resume, withdraw, end. Approval is admin-only (see /api/v1/admin). */
export const POST = route(
  { name: "ads.campaign_transition", feature: "ads.manage", params: idParams, body: campaignActionSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => ({ status: await transitionCampaign(session.db, params.id, body.action) }),
);
