import { shareReelSchema } from "@backend/modules/reels/schemas";
import { shareReel } from "@backend/modules/reels/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Sends the reel to conversations as a message. */
export const POST = route(
  { name: "reels.share", params: idParams, body: shareReelSchema, feature: "messages.send", rateLimitPerMinute: 20 },
  async ({ session, params, body }) => shareReel(session.db, session.viewer, params.id, body),
);
