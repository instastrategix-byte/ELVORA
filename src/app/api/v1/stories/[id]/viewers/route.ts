import { listStoryViewers } from "@backend/modules/stories/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Who viewed one of your own stories. */
export const GET = route({ name: "stories.viewers", params: idParams }, async ({ session, params }) =>
  listStoryViewers(session.db, session.viewer, params.id),
);
