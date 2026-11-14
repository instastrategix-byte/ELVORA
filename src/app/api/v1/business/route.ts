import { businessSchema } from "@backend/modules/listings/schemas";
import { getOwnBusiness, saveBusiness } from "@backend/modules/listings/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "business.get" }, async ({ session }) => getOwnBusiness(session.db, session.viewer));

/** Creates or updates the member's business profile. Verification status is staff-controlled. */
export const PUT = route(
  { name: "business.save", feature: "business.manage", body: businessSchema, rateLimitPerMinute: 20 },
  async ({ session, body }) => saveBusiness(session.db, session.viewer, body),
);
