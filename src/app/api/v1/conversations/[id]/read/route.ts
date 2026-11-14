import { markConversationRead } from "@backend/modules/messaging/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "messages.read", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) => {
  await markConversationRead(session.db, session.viewer, params.id);
  return { read: true };
});
