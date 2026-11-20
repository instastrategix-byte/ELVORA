import { dealRoomStatusSchema, setDealRoomStatus } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "deal_rooms.status", params: idParams, body: dealRoomStatusSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await setDealRoomStatus(session.db, params.id, body.status);
    return { ok: true };
  },
);
