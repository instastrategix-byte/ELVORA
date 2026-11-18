import { rotateSecret } from "@backend/modules/advertising/tracking/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Issues a new server signing secret (returned once); the previous secret stops working immediately. */
export const POST = route({ name: "ads.tracking.rotate", params: idParams, rateLimitPerMinute: 5 }, async ({ session, params }) =>
  rotateSecret(session.db, params.id),
);
