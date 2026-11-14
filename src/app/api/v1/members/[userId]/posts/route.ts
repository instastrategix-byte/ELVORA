import { z } from "zod";
import { listAuthorPosts } from "@backend/modules/feed/service";
import { userIdParams } from "@backend/http/params";
import { dbFor, route } from "@backend/http/route";

/** A member's posts, filtered by RLS to what the caller may see. */
export const GET = route(
  { name: "members.posts", auth: "public", params: userIdParams, query: z.object({ cursor: z.string().max(200).optional() }) },
  async ({ session, params, query }) => listAuthorPosts(await dbFor(session), session?.viewer ?? null, params.userId, query.cursor),
);
