import { z } from "zod";
import { memberActionSchema } from "@backend/modules/communities/schemas";
import { listMembers, manageMember } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

const query = z.object({ status: z.enum(["active", "pending", "banned"]).default("active") });

/** RLS: readers see active members; moderators also see pending requests and bans. */
export const GET = route({ name: "communities.members", params: idParams, query, rateLimitPerMinute: 60 }, async ({ session, params, query }) =>
  listMembers(session.db, params.id, query.status),
);

/** Approve/decline requests, ban/unban, remove, promote/demote — the database enforces who may do what. */
export const POST = route({ name: "communities.members.manage", params: idParams, body: memberActionSchema, rateLimitPerMinute: 60 }, async ({ session, params, body }) => {
  await manageMember(session.db, params.id, body.userId, body.action);
  return { ok: true };
});
