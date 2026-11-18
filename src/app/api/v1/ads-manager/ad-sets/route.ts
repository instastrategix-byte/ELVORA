import { createAdSet } from "@backend/modules/advertising";
import { adSetCreateSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

export const POST = route({ name: "ads_manager.ad_sets.create", body: adSetCreateSchema, rateLimitPerMinute: 30 }, async ({ session, body }) =>
  createAdSet(session.db, body),
);
