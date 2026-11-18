import { generateStatement, statementSchema } from "@backend/modules/advertising/billing/service";
import { route } from "@backend/http/route";

/** Generates (or returns the existing) monthly statement of account for a completed month. */
export const POST = route({ name: "ads.billing.statement", body: statementSchema, rateLimitPerMinute: 20 }, async ({ session, body }) =>
  generateStatement(session.db, body),
);
