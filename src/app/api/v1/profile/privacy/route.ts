import { privacyUpdateSchema } from "@backend/modules/profiles/schemas";
import { updatePrivacy } from "@backend/modules/profiles/service";
import { route } from "@backend/http/route";

export const PUT = route({ name: "profile.privacy", auth: "user", body: privacyUpdateSchema }, async ({ session, body }) => {
  await updatePrivacy(session.db, session.viewer, body);
  return { updated: true };
});
