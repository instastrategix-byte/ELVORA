import { communityUpdateSchema } from "@backend/modules/communities/schemas";
import { updateCommunity } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Owners (and staff moderators) only — enforced by RLS. */
export const PATCH = route({ name: "communities.update", params: idParams, body: communityUpdateSchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) => {
  await updateCommunity(session.db, session.viewer, params.id, body);
  return { updated: true };
});
