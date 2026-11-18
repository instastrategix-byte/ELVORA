import { appealReview } from "@backend/modules/advertising";
import { appealSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "ads_manager.reviews.appeal", params: idParams, body: appealSchema, rateLimitPerMinute: 10 },
  async ({ session, params, body }) => appealReview(session.db, params.id, body.message),
);
