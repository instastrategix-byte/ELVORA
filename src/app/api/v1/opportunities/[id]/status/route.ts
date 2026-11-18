import { opportunityStatusSchema } from "@backend/modules/opportunities/schemas";
import { setOpportunityStatus } from "@backend/modules/opportunities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "opportunities.status", params: idParams, body: opportunityStatusSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await setOpportunityStatus(session.db, params.id, body.status);
    return { ok: true };
  },
);
