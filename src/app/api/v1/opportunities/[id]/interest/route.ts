import { interestSchema } from "@backend/modules/opportunities/schemas";
import { expressInterest, withdrawInterest } from "@backend/modules/opportunities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** The signed-in member's own interest in an opportunity (private to them and the poster). */
export const POST = route(
  { name: "opportunities.interest", params: idParams, body: interestSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await expressInterest(session.db, session.viewer, params.id, body.note);
    return { ok: true };
  },
);

export const DELETE = route({ name: "opportunities.interest.withdraw", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await withdrawInterest(session.db, session.viewer, params.id);
  return { ok: true };
});
