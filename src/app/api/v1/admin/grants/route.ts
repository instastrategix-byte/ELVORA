import { planGrantSchema } from "@backend/modules/admin/schemas";
import { grantPlan } from "@backend/modules/admin/service";
import { route } from "@backend/http/route";

/** Complimentary plan grants (admins only). grant_plan() re-checks admin rank and writes the audit log. */
export const POST = route(
  { name: "admin.plan_grant", staff: "admin", body: planGrantSchema, rateLimitPerMinute: 30 },
  async ({ session, body }) => grantPlan(session.db, body),
);
