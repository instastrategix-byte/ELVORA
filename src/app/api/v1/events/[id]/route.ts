import { AppError } from "@/lib/errors";
import { eventSchema } from "@backend/modules/events/schemas";
import { deleteEvent, getEvent, updateEvent } from "@backend/modules/events/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "events.get", params: idParams }, async ({ session, params }) => {
  const event = await getEvent(session.db, session.viewer, params.id);
  if (!event) throw new AppError("not_found", "Event not found.");
  return event;
});

export const PATCH = route({ name: "events.update", params: idParams, body: eventSchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) =>
  updateEvent(session.db, session.viewer, params.id, body),
);

/** Drafts only (cancel published events instead). */
export const DELETE = route({ name: "events.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteEvent(session.db, params.id);
  return { deleted: true };
});
