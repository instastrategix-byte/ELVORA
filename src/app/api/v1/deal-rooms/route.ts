import { createDealRoom, dealRoomSchema, listDealRooms } from "@backend/modules/deal-rooms/service";
import { route } from "@backend/http/route";

/** Rooms the member can open, plus pending invitations (name + NDA only). */
export const GET = route({ name: "deal_rooms.list" }, async ({ session }) => listDealRooms(session.db, session.viewer));

export const POST = route({ name: "deal_rooms.create", body: dealRoomSchema, rateLimitPerMinute: 10 }, async ({ session, body }) =>
  createDealRoom(session.db, body),
);
