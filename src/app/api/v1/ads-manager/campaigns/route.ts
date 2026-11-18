import { z } from "zod";
import { createCampaign, listCampaigns } from "@backend/modules/advertising";
import { campaignCreateSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

const query = z.object({
  accountId: z.uuid(),
  q: z.string().max(80).optional(),
  status: z.enum(["draft", "pending_review", "active", "paused", "completed", "rejected"]).optional(),
  archived: z.enum(["1", "0"]).optional(),
});

export const GET = route({ name: "ads_manager.campaigns.list", query }, async ({ session, query }) =>
  listCampaigns(session.db, query.accountId, { q: query.q, status: query.status, archived: query.archived === "1" }),
);

export const POST = route(
  { name: "ads_manager.campaigns.create", body: campaignCreateSchema, rateLimitPerMinute: 20 },
  async ({ session, body }) => createCampaign(session.db, session.viewer, body),
);
