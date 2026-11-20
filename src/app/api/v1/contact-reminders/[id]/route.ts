import { deleteReminder, reminderUpdateSchema, updateReminder } from "@backend/modules/contacts/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const PATCH = route(
  { name: "contacts.reminder_update", params: idParams, body: reminderUpdateSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await updateReminder(session.db, params.id, body);
    return { ok: true };
  },
);

export const DELETE = route({ name: "contacts.reminder_delete", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await deleteReminder(session.db, params.id);
  return { ok: true };
});
