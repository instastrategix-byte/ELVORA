import { listingReviewSchema } from "@backend/modules/admin/schemas";
import { reviewListing } from "@backend/modules/admin/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.listing_review", staff: "moderator", params: idParams, body: listingReviewSchema },
  async ({ session, params, body }) => {
    await reviewListing(session.db, params.id, body.approve, body.note);
    return { status: body.approve ? "published" : "rejected" };
  },
);
