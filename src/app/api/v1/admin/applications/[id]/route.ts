import { applicationDecisionSchema } from "@backend/modules/admin/schemas";
import { decideApplication } from "@backend/modules/admin/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.application_decide", staff: "moderator", params: idParams, body: applicationDecisionSchema },
  async ({ session, params, body }) => {
    await decideApplication(session.db, params.id, body.status, body.note);
    return { status: body.status };
  },
);
