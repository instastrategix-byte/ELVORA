import { reactionSchema } from "@backend/modules/messaging/schemas";
import { addReaction, messageReactions, removeReaction } from "@backend/modules/messaging/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** React to a message with an emoji. Returns the message's updated reaction summary. */
export const POST = route(
  { name: "messages.react", params: idParams, body: reactionSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await addReaction(session.db, session.viewer, params.id, body.emoji);
    return messageReactions(session.db, session.viewer, params.id);
  },
);

/** Remove one of the viewer's reactions. Returns the updated summary. */
export const DELETE = route(
  { name: "messages.unreact", params: idParams, body: reactionSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await removeReaction(session.db, session.viewer, params.id, body.emoji);
    return messageReactions(session.db, session.viewer, params.id);
  },
);
