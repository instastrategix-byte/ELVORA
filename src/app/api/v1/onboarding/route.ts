import { onboardingProfileSchema } from "@backend/modules/membership/schemas";
import { completeOnboarding, updateProfile } from "@backend/modules/profiles/service";
import { route } from "@backend/http/route";

/** Saves the minimum profile and marks onboarding complete (handle uniqueness enforced by the DB). */
export const POST = route(
  { name: "onboarding.complete", auth: "user", body: onboardingProfileSchema, rateLimitPerMinute: 20 },
  async ({ session, body }) => {
    await updateProfile(session.db, session.viewer, {
      handle: body.handle,
      displayName: body.displayName,
      headline: body.headline || null,
      location: body.location || null,
    });
    await completeOnboarding(session.db);
    return { onboarded: true };
  },
);
