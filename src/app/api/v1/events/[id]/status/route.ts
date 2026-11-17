import { eventActionSchema } from "@backend/modules/events/schemas";
import { applyEventAction } from "@backend/modules/events/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** publish | unpublish (only before anyone responds) | cancel (final; notifies respondents). */
export const POST = route(
  { name: "events.status", params: idParams, body: eventActionSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => applyEventAction(session.db, params.id, body.action),
);
