import { applicationSchema } from "@backend/modules/membership/schemas";
import { createApplication } from "@backend/modules/membership/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "applications.create", body: applicationSchema, rateLimitPerMinute: 5 },
  async ({ session, body }) => createApplication(session.db, session.viewer, body),
);
