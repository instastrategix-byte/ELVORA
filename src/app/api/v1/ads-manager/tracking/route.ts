import { z } from "zod";
import { createIntegration, integrationCreateSchema, listIntegrations } from "@backend/modules/advertising/tracking/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads.tracking.list", query: z.object({ account: z.uuid() }) }, async ({ session, query }) =>
  listIntegrations(session.db, query.account),
);

/** Creates a pixel or server integration. A server secret is returned in this response only. */
export const POST = route({ name: "ads.tracking.create", body: integrationCreateSchema, rateLimitPerMinute: 10 }, async ({ session, body }) =>
  createIntegration(session.db, body),
);
