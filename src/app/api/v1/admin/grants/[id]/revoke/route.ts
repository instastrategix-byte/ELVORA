import { revokeGrantSchema } from "@backend/modules/admin/schemas";
import { revokePlanGrant } from "@backend/modules/admin/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.plan_grant_revoke", staff: "admin", params: idParams, body: revokeGrantSchema },
  async ({ session, params, body }) => {
    await revokePlanGrant(session.db, params.id, body.reason);
    return { revoked: true };
  },
);
