import { opportunityListSchema, opportunitySchema } from "@backend/modules/opportunities/schemas";
import { createOpportunity, listOpportunities } from "@backend/modules/opportunities/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "opportunities.list", query: opportunityListSchema }, async ({ session, query }) =>
  listOpportunities(session.db, session.viewer, query),
);

export const POST = route(
  { name: "opportunities.create", feature: "feed.post", body: opportunitySchema, rateLimitPerMinute: 5 },
  async ({ session, body }) => createOpportunity(session.db, session.viewer, body),
);
