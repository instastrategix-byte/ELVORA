import { joinCommunity, leaveCommunity } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Join (open: instant; private: pending request — decided by the database). */
export const POST = route({ name: "communities.join", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) =>
  joinCommunity(session.db, session.viewer, params.id),
);

/** Leave, or withdraw a pending request. */
export const DELETE = route({ name: "communities.leave", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await leaveCommunity(session.db, session.viewer, params.id);
  return { left: true };
});
