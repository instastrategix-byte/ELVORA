import { z } from "zod";
import { setArchived } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "communities.archive", params: idParams, body: z.object({ archived: z.boolean() }), rateLimitPerMinute: 10 },
  async ({ session, params, body }) => {
    await setArchived(session.db, params.id, body.archived);
    return { archived: body.archived };
  },
);
