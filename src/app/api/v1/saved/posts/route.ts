import { z } from "zod";
import { listSavedPosts } from "@backend/modules/feed/service";
import { route } from "@backend/http/route";

export const GET = route(
  { name: "saved.posts", query: z.object({ cursor: z.string().max(200).optional() }) },
  async ({ session, query }) => listSavedPosts(session.db, session.viewer, query.cursor),
);
