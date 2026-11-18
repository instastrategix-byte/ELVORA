import { AppError } from "@/lib/errors";
import { deleteCampaign, getCampaignDetail, updateCampaign } from "@backend/modules/advertising";
import { campaignUpdateSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads_manager.campaigns.get", params: idParams }, async ({ session, params }) => {
  const campaign = await getCampaignDetail(session.db, params.id);
  if (!campaign) throw new AppError("not_found", "Campaign not found.");
  return campaign;
});

export const PATCH = route(
  { name: "ads_manager.campaigns.update", params: idParams, body: campaignUpdateSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await updateCampaign(session.db, params.id, body);
    return getCampaignDetail(session.db, params.id);
  },
);

export const DELETE = route({ name: "ads_manager.campaigns.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteCampaign(session.db, params.id);
  return { ok: true };
});
