import { moderationSchema } from "@backend/modules/admin/schemas";
import { moderate } from "@backend/modules/admin/service";
import { route } from "@backend/http/route";

/** Hide/remove/restore content, warn, suspend or reinstate accounts. Audited in SQL. */
export const POST = route(
  { name: "admin.moderate", staff: "moderator", body: moderationSchema, rateLimitPerMinute: 60 },
  async ({ session, body }) => ({ actionId: await moderate(session.db, body) }),
);
