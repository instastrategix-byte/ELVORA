import { invitationCodeSchema } from "@backend/modules/membership/schemas";
import { checkInvitation } from "@backend/modules/membership/service";
import { dbFor, route } from "@backend/http/route";

/** Public, rate-limited: reveals only validity and the plan name. */
export const POST = route(
  { name: "invitations.check", auth: "public", body: invitationCodeSchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => checkInvitation(await dbFor(session), body.code),
);
