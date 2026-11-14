import { getMembershipOverview, listPlans } from "@backend/modules/membership/service";
import { dbFor, route } from "@backend/http/route";

/** Plans and prices (public); with a session, also the member's applications, verifications and billing. */
export const GET = route({ name: "membership.overview", auth: "public" }, async ({ session }) => {
  if (!session) return { plans: await listPlans(await dbFor(null)) };
  return getMembershipOverview(session.db, session.viewer);
});
