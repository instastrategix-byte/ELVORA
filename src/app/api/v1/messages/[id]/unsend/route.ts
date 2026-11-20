import { unsendMessage } from "@backend/modules/messaging/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/**
 * Unsend one of your own messages, within 10 minutes of sending it. The database enforces the
 * sender and the time window; repeating the request is harmless. Returns the unsent message.
 */
export const POST = route({ name: "messages.unsend", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) =>
  unsendMessage(session.db, params.id),
);
