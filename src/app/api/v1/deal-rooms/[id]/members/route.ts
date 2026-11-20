import { dealRoomInviteSchema, inviteCandidates, inviteToDealRoom } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Connections who can still be invited. */
export const GET = route({ name: "deal_rooms.invite_candidates", params: idParams }, async ({ session, params }) =>
  inviteCandidates(session.db, session.viewer, params.id),
);

export const POST = route(
  { name: "deal_rooms.invite", params: idParams, body: dealRoomInviteSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await inviteToDealRoom(session.db, params.id, body);
    return { ok: true };
  },
);
