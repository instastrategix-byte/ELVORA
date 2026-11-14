import { setListingSaved } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "listings.save", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) => {
  await setListingSaved(session.db, session.viewer, params.id, true);
  return { saved: true };
});

export const DELETE = route({ name: "listings.unsave", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) => {
  await setListingSaved(session.db, session.viewer, params.id, false);
  return { saved: false };
});
