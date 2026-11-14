import { z } from "zod";
import { unwrap } from "@backend/http/db-errors";
import { route } from "@backend/http/route";

/**
 * Staff provisioning (admins only). The SQL functions re-check admin rank and write the audit log.
 * The very first admin is bootstrapped via SQL — see docs/DEPLOYMENT_RUNBOOK.md §First administrator.
 */
export const POST = route(
  { name: "admin.staff_grant", staff: "admin", body: z.object({ userId: z.uuid(), role: z.enum(["support", "moderator", "admin"]) }) },
  async ({ session, body }) => {
    unwrap(await session.db.rpc("grant_staff_role", { p_user: body.userId, p_role: body.role }));
    return { granted: body.role };
  },
);

export const DELETE = route(
  { name: "admin.staff_revoke", staff: "admin", body: z.object({ userId: z.uuid() }) },
  async ({ session, body }) => {
    unwrap(await session.db.rpc("revoke_staff_role", { p_user: body.userId }));
    return { revoked: true };
  },
);
