import { z } from "zod";
import { dealRoomRoleSchema, removeDealRoomMember, setDealRoomMemberRole } from "@backend/modules/deal-rooms/service";
import { route } from "@backend/http/route";

const memberParams = z.object({ id: z.uuid(), userId: z.uuid() });

export const PATCH = route(
  { name: "deal_rooms.member_role", params: memberParams, body: dealRoomRoleSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await setDealRoomMemberRole(session.db, params.id, params.userId, body.role);
    return { ok: true };
  },
);

export const DELETE = route({ name: "deal_rooms.member_remove", params: memberParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await removeDealRoomMember(session.db, params.id, params.userId);
  return { ok: true };
});
