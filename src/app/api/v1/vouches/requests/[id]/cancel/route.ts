import { cancelVouchRequest } from "@backend/modules/vouches/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "vouches.cancel", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await cancelVouchRequest(session.db, params.id);
  return { ok: true };
});
