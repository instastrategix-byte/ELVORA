import { deleteStory } from "@backend/modules/stories/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const DELETE = route({ name: "stories.delete", params: idParams }, async ({ session, params }) => {
  await deleteStory(session.db, session.viewer, params.id);
  return { deleted: true };
});
