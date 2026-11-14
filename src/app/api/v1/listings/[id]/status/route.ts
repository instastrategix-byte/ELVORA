import { listingActionSchema } from "@backend/modules/listings/schemas";
import { applyListingAction } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** submit -> pending_review; archive; publish (only previously approved, unchanged listings); draft. */
export const POST = route(
  { name: "listings.status", params: idParams, body: listingActionSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => {
    await applyListingAction(session.db, params.id, body.action);
    return { action: body.action };
  },
);
