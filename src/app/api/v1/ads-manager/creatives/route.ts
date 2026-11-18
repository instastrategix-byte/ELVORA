import { z } from "zod";
import { createCreative, listCreatives } from "@backend/modules/advertising";
import { creativeCreateSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads_manager.creatives.list", query: z.object({ accountId: z.uuid() }) }, async ({ session, query }) =>
  listCreatives(session.db, query.accountId),
);

export const POST = route({ name: "ads_manager.creatives.create", body: creativeCreateSchema, rateLimitPerMinute: 30 }, async ({ session, body }) =>
  createCreative(session.db, body),
);
