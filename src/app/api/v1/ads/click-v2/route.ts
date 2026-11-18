import { z } from "zod";
import { recordSponsoredClick } from "@backend/modules/advertising";
import { route } from "@backend/http/route";

/** Records one click per impression and returns the server-resolved destination. */
export const POST = route({ name: "ads.click_v2", body: z.object({ impressionId: z.uuid() }), rateLimitPerMinute: 30 }, async ({ session, body }) =>
  recordSponsoredClick(session.db, body.impressionId),
);
