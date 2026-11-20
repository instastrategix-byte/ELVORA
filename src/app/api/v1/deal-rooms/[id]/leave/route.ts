import { leaveDealRoom } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Decline an invitation or leave a room. */
export const POST = route({ name: "deal_rooms.leave", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await leaveDealRoom(session.db, params.id);
  return { ok: true };
});
