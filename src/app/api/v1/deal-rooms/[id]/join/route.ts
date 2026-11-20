import { dealRoomJoinSchema, joinDealRoom } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Accept an invitation, or a changed NDA. The NDA version must match the one shown. */
export const POST = route(
  { name: "deal_rooms.join", params: idParams, body: dealRoomJoinSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await joinDealRoom(session.db, params.id, body.ndaVersion);
    return { ok: true };
  },
);
