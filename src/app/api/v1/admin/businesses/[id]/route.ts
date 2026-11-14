import { businessReviewSchema } from "@backend/modules/admin/schemas";
import { reviewBusiness } from "@backend/modules/admin/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.business_review", staff: "moderator", params: idParams, body: businessReviewSchema },
  async ({ session, params, body }) => {
    await reviewBusiness(session.db, params.id, body.status, body.note);
    return { status: body.status };
  },
);
