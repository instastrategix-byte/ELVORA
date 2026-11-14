import { z } from "zod";
import { removeConnection, respondToConnection } from "@backend/modules/connections/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Accept or decline an incoming request (addressee only; enforced in SQL). */
export const PATCH = route(
  { name: "connections.respond", params: idParams, body: z.object({ accept: z.boolean() }) },
  async ({ session, params, body }) => {
    await respondToConnection(session.db, params.id, body.accept);
    return { status: body.accept ? "accepted" : "declined" };
  },
);

/** Withdraw a sent request or remove an existing connection. */
export const DELETE = route({ name: "connections.remove", params: idParams }, async ({ session, params }) => {
  await removeConnection(session.db, params.id);
  return { removed: true };
});
