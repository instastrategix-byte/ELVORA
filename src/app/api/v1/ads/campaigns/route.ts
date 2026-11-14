import { campaignSchema } from "@backend/modules/ads/schemas";
import { createCampaign, listCampaigns } from "@backend/modules/ads/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads.campaigns_list" }, async ({ session }) => listCampaigns(session.db, session.viewer));

export const POST = route(
  { name: "ads.campaigns_create", feature: "ads.manage", body: campaignSchema, rateLimitPerMinute: 20 },
  async ({ session, body }) => createCampaign(session.db, session.viewer, body),
);
