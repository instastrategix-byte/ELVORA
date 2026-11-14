import { campaignReviewSchema } from "@backend/modules/admin/schemas";
import { transitionCampaign } from "@backend/modules/ads/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Approval makes a campaign eligible for serving (status active) within its schedule and budget. */
export const POST = route(
  { name: "admin.campaign_review", staff: "moderator", params: idParams, body: campaignReviewSchema },
  async ({ session, params, body }) => ({ status: await transitionCampaign(session.db, params.id, body.action, body.note) }),
);
