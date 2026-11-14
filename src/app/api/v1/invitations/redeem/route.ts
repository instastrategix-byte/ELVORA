import { redeemInvitationSchema } from "@backend/modules/membership/schemas";
import { redeemInvitation } from "@backend/modules/membership/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "invitations.redeem", auth: "user", body: redeemInvitationSchema, rateLimitPerMinute: 5 },
  async ({ session, body }) => redeemInvitation(session.db, body),
);
