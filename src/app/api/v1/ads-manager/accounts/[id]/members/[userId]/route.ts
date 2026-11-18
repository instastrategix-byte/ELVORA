import { z } from "zod";
import { removeAdAccountMember, setAdAccountMemberRole } from "@backend/modules/advertising";
import { memberRoleSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

const params = z.object({ id: z.uuid(), userId: z.uuid() });

export const PATCH = route(
  { name: "ads_manager.members.role", params, body: memberRoleSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await setAdAccountMemberRole(session.db, params.id, params.userId, body.role);
    return { ok: true };
  },
);

export const DELETE = route({ name: "ads_manager.members.remove", params, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await removeAdAccountMember(session.db, params.id, params.userId);
  return { ok: true };
});
