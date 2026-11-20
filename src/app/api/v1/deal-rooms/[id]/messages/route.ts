import { dealRoomMessageSchema, postDealRoomMessage } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "deal_rooms.message", params: idParams, body: dealRoomMessageSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await postDealRoomMessage(session.db, params.id, body.body);
    return { ok: true };
  },
);
