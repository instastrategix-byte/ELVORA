import { campaignAction } from "@backend/modules/advertising";
import { campaignActionSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** submit · pause · resume · archive · unarchive · duplicate (returns the new campaign id). */
export const POST = route(
  { name: "ads_manager.campaigns.action", params: idParams, body: campaignActionSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => campaignAction(session.db, params.id, body.action),
);
