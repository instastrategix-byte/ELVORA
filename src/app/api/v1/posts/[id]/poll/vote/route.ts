import { pollVoteSchema } from "@backend/modules/feed/schemas";
import { clearPollVote, votePoll } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Cast or change a vote. Returns aggregate results only — never who voted. */
export const POST = route(
  { name: "posts.poll.vote", params: idParams, body: pollVoteSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => votePoll(session.db, params.id, body),
);

/** Remove the viewer's vote while the poll is open. */
export const DELETE = route({ name: "posts.poll.unvote", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) =>
  clearPollVote(session.db, params.id),
);
