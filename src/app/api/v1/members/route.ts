import { hasFeature } from "@backend/modules/auth/permissions";
import { memberSearchSchema } from "@backend/modules/profiles/schemas";
import { searchMembers } from "@backend/modules/profiles/service";
import { dbFor, route } from "@backend/http/route";

/** Member discovery. Guests see public profiles only (RLS); advanced filters need discover.advanced. */
export const GET = route({ name: "members.search", auth: "public", query: memberSearchSchema, rateLimitPerMinute: 60 }, async ({ session, query }) => {
  const viewer = session?.viewer ?? null;
  const advanced = hasFeature(viewer, "discover.advanced");
  return searchMembers(await dbFor(session), viewer, {
    q: query.q,
    cursor: query.cursor,
    location: advanced ? query.location : undefined,
    industry: advanced ? query.industry : undefined,
    verified: advanced ? query.verified : undefined,
  });
});
