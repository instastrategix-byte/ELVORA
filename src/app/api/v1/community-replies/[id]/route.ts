import { deleteReply } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Authors, community moderators and staff (RLS). */
export const DELETE = route({ name: "replies.delete", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await deleteReply(session.db, params.id);
  return { deleted: true };
});
