import { setReelLike } from "@backend/modules/reels/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "reels.like", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) =>
  setReelLike(session.db, session.viewer, params.id, true),
);

export const DELETE = route({ name: "reels.unlike", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) =>
  setReelLike(session.db, session.viewer, params.id, false),
);
