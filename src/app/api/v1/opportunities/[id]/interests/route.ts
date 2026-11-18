import { interestDecisionSchema } from "@backend/modules/opportunities/schemas";
import { listInterests, setInterestStatus } from "@backend/modules/opportunities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Poster-only (enforced by RLS): who is interested, and shortlist / decline decisions. */
export const GET = route({ name: "opportunities.interests", params: idParams }, async ({ session, params }) =>
  listInterests(session.db, session.viewer, params.id),
);

export const POST = route(
  { name: "opportunities.interests.decide", params: idParams, body: interestDecisionSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await setInterestStatus(session.db, params.id, body.userId, body.status);
    return { ok: true };
  },
);
