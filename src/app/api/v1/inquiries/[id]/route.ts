import { inquiryStatusSchema } from "@backend/modules/listings/schemas";
import { updateInquiryStatus } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Business owners update the handling status of inquiries they received (RLS-enforced). */
export const PATCH = route({ name: "inquiries.update", params: idParams, body: inquiryStatusSchema }, async ({ session, params, body }) => {
  await updateInquiryStatus(session.db, params.id, body.status);
  return { status: body.status };
});
