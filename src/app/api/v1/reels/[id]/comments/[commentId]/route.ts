import { reelCommentParams } from "@backend/modules/reels/schemas";
import { deleteReelComment } from "@backend/modules/reels/service";
import { route } from "@backend/http/route";

export const DELETE = route({ name: "reels.comments.delete", params: reelCommentParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await deleteReelComment(session.db, params.id, params.commentId);
  return { deleted: true };
});
