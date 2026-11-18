import { updateLinkSchema } from "@backend/modules/profiles/schemas";
import { removeLink, updateLink } from "@backend/modules/profiles/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route(
  { name: "profile.links.update", auth: "user", params: idParams, body: updateLinkSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => updateLink(session.db, session.viewer, params.id, body),
);

export const DELETE = route({ name: "profile.links.delete", auth: "user", params: idParams, rateLimitPerMinute: 60 }, async ({ session, params }) => {
  await removeLink(session.db, session.viewer, params.id);
  return { ok: true };
});
