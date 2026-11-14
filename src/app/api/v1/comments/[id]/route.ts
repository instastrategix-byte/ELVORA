import { deleteComment } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const DELETE = route({ name: "comments.delete", params: idParams }, async ({ session, params }) => {
  await deleteComment(session.db, params.id);
  return { deleted: true };
});
