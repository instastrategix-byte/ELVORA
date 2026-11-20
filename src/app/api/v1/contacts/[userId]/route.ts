import { contactNoteSchema, deleteContactNote, getContact, saveContactNote } from "@backend/modules/contacts/service";
import { userIdParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** The viewer's private note and open reminders about one member. Never visible to that member. */
export const GET = route({ name: "contacts.get", params: userIdParams }, async ({ session, params }) => getContact(session.db, params.userId));

export const PUT = route(
  { name: "contacts.save", params: userIdParams, body: contactNoteSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => saveContactNote(session.db, params.userId, body),
);

export const DELETE = route({ name: "contacts.delete", params: userIdParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await deleteContactNote(session.db, params.userId);
  return { ok: true };
});
