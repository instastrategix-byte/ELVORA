import { z } from "zod";
import { introductionPaths } from "@backend/modules/introductions/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "introductions.paths", query: z.object({ target: z.uuid() }) }, async ({ session, query }) =>
  introductionPaths(session.db, query.target),
);
