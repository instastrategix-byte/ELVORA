import { setFollow } from "@backend/modules/connections/service";
import { userIdParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "follows.create", params: userIdParams, rateLimitPerMinute: 60 }, async ({ session, params }) => {
  await setFollow(session.db, session.viewer, params.userId, true);
  return { following: true };
});

export const DELETE = route({ name: "follows.delete", params: userIdParams }, async ({ session, params }) => {
  await setFollow(session.db, session.viewer, params.userId, false);
  return { following: false };
});
