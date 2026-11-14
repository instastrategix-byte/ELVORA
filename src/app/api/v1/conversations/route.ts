import { z } from "zod";
import { startConversationSchema } from "@backend/modules/messaging/schemas";
import { listConversations, startConversation } from "@backend/modules/messaging/service";
import { route } from "@backend/http/route";

export const GET = route(
  { name: "conversations.list", query: z.object({ before: z.iso.datetime({ offset: true }).optional() }) },
  async ({ session, query }) => listConversations(session.db, session.viewer, query.before),
);

/** Finds or creates a 1:1 conversation. The other member's messaging policy is enforced in SQL. */
export const POST = route(
  { name: "conversations.start", feature: "messages.send", body: startConversationSchema, rateLimitPerMinute: 20 },
  async ({ session, body }) => startConversation(session.db, session.viewer, body.userId),
);
