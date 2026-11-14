import { verificationRequestSchema } from "@backend/modules/membership/schemas";
import { requestVerification } from "@backend/modules/membership/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "verifications.request", body: verificationRequestSchema, rateLimitPerMinute: 5 },
  async ({ session, body }) => {
    await requestVerification(session.db, session.viewer, body);
    return { status: "pending" };
  },
);
