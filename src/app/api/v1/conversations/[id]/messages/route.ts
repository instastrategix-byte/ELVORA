import { AppError } from "@/lib/errors";
import { messagesQuerySchema, sendMessageSchema } from "@backend/modules/messaging/schemas";
import { getConversation, listMessages, sendMessage } from "@backend/modules/messaging/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route(
  { name: "messages.list", params: idParams, query: messagesQuerySchema },
  async ({ session, params, query }) => {
    const conversation = await getConversation(session.db, session.viewer, params.id);
    if (!conversation) throw new AppError("not_found", "Conversation not found.");
    return listMessages(session.db, params.id, query);
  },
);

/** Persists first; the realtime broadcast is emitted by the database after the row exists. */
export const POST = route(
  { name: "messages.send", feature: "messages.send", params: idParams, body: sendMessageSchema, rateLimitPerMinute: 60, maxBodyBytes: 16_384 },
  async ({ session, params, body }) => sendMessage(session.db, session.viewer, params.id, body),
);
