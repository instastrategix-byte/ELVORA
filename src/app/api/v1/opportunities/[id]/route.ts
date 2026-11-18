import { AppError } from "@/lib/errors";
import { opportunitySchema } from "@backend/modules/opportunities/schemas";
import { deleteOpportunity, getOpportunity, updateOpportunity } from "@backend/modules/opportunities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "opportunities.get", params: idParams }, async ({ session, params }) => {
  const opp = await getOpportunity(session.db, session.viewer, params.id);
  if (!opp) throw new AppError("not_found", "Opportunity not found.");
  return opp;
});

export const PATCH = route(
  { name: "opportunities.update", params: idParams, body: opportunitySchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => updateOpportunity(session.db, session.viewer, params.id, body),
);

export const DELETE = route({ name: "opportunities.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteOpportunity(session.db, params.id);
  return { ok: true };
});
