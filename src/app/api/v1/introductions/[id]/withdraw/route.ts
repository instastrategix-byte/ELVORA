import { withdrawIntroduction } from "@backend/modules/introductions/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "introductions.withdraw", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await withdrawIntroduction(session.db, params.id);
  return { ok: true };
});
