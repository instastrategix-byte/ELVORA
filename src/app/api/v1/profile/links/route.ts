import { addLinkSchema } from "@backend/modules/profiles/schemas";
import { addLink, listLinks } from "@backend/modules/profiles/service";
import { route } from "@backend/http/route";

/** The signed-in member's own profile links (all of them, whatever their visibility). */
export const GET = route({ name: "profile.links.list", auth: "user" }, async ({ session }) => listLinks(session.db, session.viewer.id));

export const POST = route(
  { name: "profile.links.create", auth: "user", body: addLinkSchema, rateLimitPerMinute: 30 },
  async ({ session, body }) => addLink(session.db, session.viewer, body),
);
