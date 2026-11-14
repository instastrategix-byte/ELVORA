import { getPreferences, preferencesSchema, updatePreferences } from "@backend/modules/notifications/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "notification_prefs.get", auth: "user" }, async ({ session }) => getPreferences(session.db, session.viewer));

export const PUT = route({ name: "notification_prefs.update", auth: "user", body: preferencesSchema }, async ({ session, body }) => {
  await updatePreferences(session.db, session.viewer, body);
  return body;
});
