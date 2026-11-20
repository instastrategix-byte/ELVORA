import { z } from "zod";
import { getVouchInbox, listProfileVouches, vouchFor, vouchSchema } from "@backend/modules/vouches/service";
import { route } from "@backend/http/route";

/** With ?profile=<id>: the vouches on that profile the viewer may see. Without: the viewer's own vouch inbox. */
export const GET = route({ name: "vouches.list", query: z.object({ profile: z.uuid().optional() }) }, async ({ session, query }) =>
  query.profile ? listProfileVouches(session.db, query.profile) : getVouchInbox(session.db, session.viewer),
);

export const POST = route({ name: "vouches.create", body: vouchSchema, rateLimitPerMinute: 10 }, async ({ session, body }) => vouchFor(session.db, body));
