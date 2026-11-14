import { reportSchema } from "@backend/modules/feed/schemas";
import { createReport } from "@backend/modules/feed/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "reports.create", body: reportSchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => {
    await createReport(session.db, session.viewer, body);
    return { received: true };
  },
);
