import { respondIntroductionSchema, respondToIntroduction } from "@backend/modules/introductions/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "introductions.respond", params: idParams, body: respondIntroductionSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await respondToIntroduction(session.db, params.id, body);
    return { ok: true };
  },
);
