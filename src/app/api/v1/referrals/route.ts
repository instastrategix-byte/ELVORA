import { createReferral, createReferralSchema, referralOverview } from "@backend/modules/referrals/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "referrals.list" }, async ({ session }) => referralOverview(session.db, session.viewer));

export const POST = route({ name: "referrals.create", body: createReferralSchema, rateLimitPerMinute: 10 }, async ({ session, body }) =>
  createReferral(session.db, body),
);
