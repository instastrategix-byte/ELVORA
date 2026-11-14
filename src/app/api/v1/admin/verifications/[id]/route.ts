import { verificationDecisionSchema } from "@backend/modules/admin/schemas";
import { decideVerification } from "@backend/modules/admin/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.verification_decide", staff: "moderator", params: idParams, body: verificationDecisionSchema },
  async ({ session, params, body }) => {
    await decideVerification(session.db, params.id, body.status, body.note);
    return { status: body.status };
  },
);
