import { createAd } from "@backend/modules/advertising";
import { adCreateSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

export const POST = route({ name: "ads_manager.ads.create", body: adCreateSchema, rateLimitPerMinute: 30 }, async ({ session, body }) =>
  createAd(session.db, body),
);
