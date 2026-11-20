import { requestVouch, vouchRequestSchema } from "@backend/modules/vouches/service";
import { route } from "@backend/http/route";

/** Ask a connection to vouch for you. */
export const POST = route({ name: "vouches.request", body: vouchRequestSchema, rateLimitPerMinute: 5 }, async ({ session, body }) =>
  requestVouch(session.db, body),
);
