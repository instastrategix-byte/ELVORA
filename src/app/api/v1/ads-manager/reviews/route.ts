import { z } from "zod";
import { listAccountReviews } from "@backend/modules/advertising";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads_manager.reviews.list", query: z.object({ accountId: z.uuid() }) }, async ({ session, query }) =>
  listAccountReviews(session.db, query.accountId),
);
