import { z } from "zod";
import { createAudience, listAudiences } from "@backend/modules/advertising";
import { audienceCreateSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads_manager.audiences.list", query: z.object({ accountId: z.uuid() }) }, async ({ session, query }) =>
  listAudiences(session.db, query.accountId),
);

export const POST = route({ name: "ads_manager.audiences.create", body: audienceCreateSchema, rateLimitPerMinute: 20 }, async ({ session, body }) =>
  createAudience(session.db, body),
);
