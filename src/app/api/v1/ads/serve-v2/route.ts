import { z } from "zod";
import { serveSponsored } from "@backend/modules/advertising";
import { AD_PLACEMENTS } from "@backend/modules/advertising/constants";
import { route } from "@backend/http/route";

const query = z.object({
  placement: z.enum([...AD_PLACEMENTS, "luxury"]),
  limit: z.coerce.number().int().min(1).max(3).default(1),
});

/** Serves (and records) sponsored items for the signed-in member. Every item must be shown labelled "Sponsored". */
export const GET = route({ name: "ads.serve_v2", query, rateLimitPerMinute: 60 }, async ({ session, query }) =>
  serveSponsored(session.db, query.placement, query.limit),
);
