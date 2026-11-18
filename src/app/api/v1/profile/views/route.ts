import { z } from "zod";
import { recordProfileView } from "@backend/modules/insights/service";
import { route } from "@backend/http/route";

/** Records that the signed-in member viewed a profile. Deduplicated per day in SQL. */
export const POST = route(
  { name: "profile.views.record", body: z.object({ profileId: z.uuid() }), rateLimitPerMinute: 120 },
  async ({ session, body }) => {
    await recordProfileView(session.db, body.profileId);
    return { ok: true };
  },
);
