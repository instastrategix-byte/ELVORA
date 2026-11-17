import { inviteSchema } from "@backend/modules/events/schemas";
import { inviteToEvent } from "@backend/modules/events/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Host-only (enforced in public.invite_to_event). */
export const POST = route(
  { name: "events.invite", params: idParams, body: inviteSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await inviteToEvent(session.db, params.id, body.handle);
    return { invited: true };
  },
);
