import { listAttendees } from "@backend/modules/events/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Host and staff see every response; confirmed attendees see the guest list; others see only themselves. */
export const GET = route({ name: "events.attendees", params: idParams, rateLimitPerMinute: 60 }, async ({ session, params }) =>
  listAttendees(session.db, params.id),
);
