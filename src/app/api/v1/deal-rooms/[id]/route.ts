import { AppError } from "@/lib/errors";
import { dealRoomSchema, getDealRoom, updateDealRoom } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "deal_rooms.get", params: idParams }, async ({ session, params }) => {
  const room = await getDealRoom(session.db, session.viewer, params.id);
  if (!room) throw new AppError("not_found", "Deal room not found.");
  return room;
});

export const PATCH = route(
  { name: "deal_rooms.update", params: idParams, body: dealRoomSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await updateDealRoom(session.db, params.id, body);
    return { ok: true };
  },
);
