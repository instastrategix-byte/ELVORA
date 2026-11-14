import { submitBusiness } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "business.submit", feature: "business.manage", params: idParams }, async ({ session, params }) => {
  await submitBusiness(session.db, params.id);
  return { status: "pending_review" };
});
