import { rsvpSchema } from "@backend/modules/events/schemas";
import { setRsvp } from "@backend/modules/events/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** The database moves "going" to "waitlisted" when the event is full. */
export const POST = route({ name: "events.rsvp", params: idParams, body: rsvpSchema, rateLimitPerMinute: 60 }, async ({ session, params, body }) =>
  setRsvp(session.db, session.viewer, params.id, body.status, body.note),
);
