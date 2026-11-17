import { eventListQuerySchema, eventSchema } from "@backend/modules/events/schemas";
import { createEvent, listUpcomingEvents } from "@backend/modules/events/service";
import { route } from "@backend/http/route";

/** Members-only. RLS limits results to events the caller may see. */
export const GET = route({ name: "events.list", query: eventListQuerySchema, rateLimitPerMinute: 120 }, async ({ session, query }) =>
  listUpcomingEvents(session.db, session.viewer, { filter: query.filter, cursor: query.cursor }),
);

/** Creates a draft. Hosting eligibility is enforced by the service and by the database policy. */
export const POST = route({ name: "events.create", body: eventSchema, rateLimitPerMinute: 20 }, async ({ session, body }) =>
  createEvent(session.db, session.viewer, body),
);
