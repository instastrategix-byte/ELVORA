import { reorderLinksSchema } from "@backend/modules/profiles/schemas";
import { reorderLinks } from "@backend/modules/profiles/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "profile.links.reorder", auth: "user", body: reorderLinksSchema, rateLimitPerMinute: 30 },
  async ({ session, body }) => reorderLinks(session.db, session.viewer, body.ids),
);
