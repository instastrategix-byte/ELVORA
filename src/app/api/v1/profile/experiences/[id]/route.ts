import { experienceUpdateSchema } from "@backend/modules/profiles/schemas";
import { deleteExperience, updateExperience } from "@backend/modules/profiles/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route(
  { name: "profile.experiences.update", auth: "user", params: idParams, body: experienceUpdateSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => updateExperience(session.db, session.viewer, params.id, body),
);

export const DELETE = route(
  { name: "profile.experiences.delete", auth: "user", params: idParams, rateLimitPerMinute: 30 },
  async ({ session, params }) => {
    await deleteExperience(session.db, session.viewer, params.id);
    return { deleted: true };
  },
);
