import { recordReelView } from "@backend/modules/reels/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Records that the viewer watched this reel. Counted once per member; the author's plays never count. */
export const POST = route({ name: "reels.view", params: idParams, rateLimitPerMinute: 240 }, async ({ session, params }) => {
  await recordReelView(session.db, params.id);
  return { recorded: true };
});
