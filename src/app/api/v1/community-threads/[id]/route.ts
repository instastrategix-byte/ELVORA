import { AppError } from "@/lib/errors";
import { threadUpdateSchema } from "@backend/modules/communities/schemas";
import { deleteThread, getThread, updateThread } from "@backend/modules/communities/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "threads.get", params: idParams }, async ({ session, params }) => {
  const thread = await getThread(session.db, session.viewer, params.id);
  if (!thread) throw new AppError("not_found", "Discussion not found.");
  return thread;
});

/** Authors edit title/body; moderators pin and lock (enforced by the database). */
export const PATCH = route({ name: "threads.update", params: idParams, body: threadUpdateSchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) => {
  await updateThread(session.db, params.id, body);
  return { updated: true };
});

export const DELETE = route({ name: "threads.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteThread(session.db, params.id);
  return { deleted: true };
});
