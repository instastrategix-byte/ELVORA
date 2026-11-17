import { experienceSchema } from "@backend/modules/profiles/schemas";
import { addExperience, listExperiences } from "@backend/modules/profiles/service";
import { route } from "@backend/http/route";

/** The signed-in member's own experience timeline. */
export const GET = route({ name: "profile.experiences.list", auth: "user" }, async ({ session }) => {
  return listExperiences(session.db, session.viewer.id);
});

export const POST = route(
  { name: "profile.experiences.create", auth: "user", body: experienceSchema, rateLimitPerMinute: 30 },
  async ({ session, body }) => addExperience(session.db, session.viewer, body),
);
