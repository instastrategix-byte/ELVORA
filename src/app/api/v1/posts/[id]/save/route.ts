import { setSaved } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "posts.save", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) => {
  await setSaved(session.db, session.viewer, params.id, true);
  return { saved: true };
});

export const DELETE = route({ name: "posts.unsave", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) => {
  await setSaved(session.db, session.viewer, params.id, false);
  return { saved: false };
});
