import { AppError } from "@/lib/errors";
import { updatePostSchema } from "@backend/modules/feed/schemas";
import { deletePost, getPost, updatePost } from "@backend/modules/feed/service";
import { idParams } from "@backend/http/params";
import { dbFor, route } from "@backend/http/route";

export const GET = route({ name: "posts.get", auth: "public", params: idParams }, async ({ session, params }) => {
  const post = await getPost(await dbFor(session), session?.viewer ?? null, params.id);
  if (!post) throw new AppError("not_found", "Post not found.");
  return post;
});

export const PATCH = route({ name: "posts.update", params: idParams, body: updatePostSchema }, async ({ session, params, body }) => {
  await updatePost(session.db, session.viewer, params.id, body);
  return getPost(session.db, session.viewer, params.id);
});

export const DELETE = route({ name: "posts.delete", params: idParams }, async ({ session, params }) => {
  await deletePost(session.db, session.viewer, params.id);
  return { deleted: true };
});
