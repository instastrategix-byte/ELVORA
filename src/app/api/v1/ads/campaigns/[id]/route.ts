import { AppError } from "@/lib/errors";
import { campaignSchema } from "@backend/modules/ads/schemas";
import { deleteCampaign, getCampaign, getCampaignReport, updateCampaign } from "@backend/modules/ads/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads.campaign_get", params: idParams }, async ({ session, params }) => {
  const campaign = await getCampaign(session.db, params.id);
  if (!campaign) throw new AppError("not_found", "Campaign not found.");
  return { campaign, report: await getCampaignReport(session.db, params.id) };
});

export const PATCH = route(
  { name: "ads.campaign_update", feature: "ads.manage", params: idParams, body: campaignSchema },
  async ({ session, params, body }) => {
    await updateCampaign(session.db, params.id, body);
    return getCampaign(session.db, params.id);
  },
);

export const DELETE = route({ name: "ads.campaign_delete", params: idParams }, async ({ session, params }) => {
  await deleteCampaign(session.db, params.id);
  return { deleted: true };
});
