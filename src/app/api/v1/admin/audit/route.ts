import { auditLog } from "@backend/modules/admin/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "admin.audit", staff: "moderator" }, async ({ session }) => auditLog(session.db));
