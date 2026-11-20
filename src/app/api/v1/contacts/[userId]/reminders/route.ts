import { addReminder, reminderCreateSchema } from "@backend/modules/contacts/service";
import { userIdParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "contacts.reminder_add", params: userIdParams, body: reminderCreateSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => addReminder(session.db, params.userId, body),
);
