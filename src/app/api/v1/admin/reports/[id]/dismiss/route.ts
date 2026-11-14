import { dismissReportSchema } from "@backend/modules/admin/schemas";
import { dismissReport } from "@backend/modules/admin/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "admin.report_dismiss", staff: "moderator", params: idParams, body: dismissReportSchema },
  async ({ session, params, body }) => {
    await dismissReport(session.db, params.id, body.note);
    return { status: "dismissed" };
  },
);
