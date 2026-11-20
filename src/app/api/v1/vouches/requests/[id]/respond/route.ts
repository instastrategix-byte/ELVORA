import { respondToVouchRequest, respondVouchRequestSchema } from "@backend/modules/vouches/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "vouches.respond", params: idParams, body: respondVouchRequestSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await respondToVouchRequest(session.db, params.id, body);
    return { ok: true };
  },
);
