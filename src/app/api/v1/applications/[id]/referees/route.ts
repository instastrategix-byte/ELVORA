import { addApplicationReferee, refereeSchema } from "@backend/modules/vouches/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Name an existing member as a referee on your own open application; they're asked to vouch for you. */
export const POST = route(
  { name: "applications.referees.add", params: idParams, body: refereeSchema, rateLimitPerMinute: 10 },
  async ({ session, params, body }) => addApplicationReferee(session.db, params.id, body),
);
