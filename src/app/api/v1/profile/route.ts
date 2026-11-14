import { profileUpdateSchema } from "@backend/modules/profiles/schemas";
import { getOwnProfile, updateProfile } from "@backend/modules/profiles/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "profile.get", auth: "user" }, async ({ session }) => {
  const p = await getOwnProfile(session.db, session.viewer);
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    headline: p.headline,
    bio: p.bio,
    jobTitle: p.job_title,
    company: p.company,
    industry: p.industry,
    location: p.location,
    website: p.website,
    interests: p.interests,
    avatarPath: p.avatar_path,
    coverPath: p.cover_path,
  };
});

/** Updates the signed-in member's own profile. Trusted fields (status, badges) are not accepted. */
export const PATCH = route(
  { name: "profile.update", auth: "user", body: profileUpdateSchema, rateLimitPerMinute: 30 },
  async ({ session, body }) => {
    await updateProfile(session.db, session.viewer, body);
    return { updated: true };
  },
);
