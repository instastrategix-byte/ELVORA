import { setBlock } from "@backend/modules/connections/service";
import { userIdParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Blocking removes any connection/follow in either direction and hides each party from the other. */
export const POST = route({ name: "blocks.create", auth: "user", params: userIdParams }, async ({ session, params }) => {
  await setBlock(session.db, session.viewer, params.userId, true);
  return { blocked: true };
});

export const DELETE = route({ name: "blocks.delete", auth: "user", params: userIdParams }, async ({ session, params }) => {
  await setBlock(session.db, session.viewer, params.userId, false);
  return { blocked: false };
});
