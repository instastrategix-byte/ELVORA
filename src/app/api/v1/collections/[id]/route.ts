import { AppError } from "@/lib/errors";
import { collectionNameSchema, deleteCollection, getCollection, renameCollection } from "@backend/modules/collections/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "collections.get", params: idParams }, async ({ session, params }) => {
  const collection = await getCollection(session.db, session.viewer, params.id);
  if (!collection) throw new AppError("not_found", "Collection not found.");
  return collection;
});

export const PATCH = route({ name: "collections.rename", params: idParams, body: collectionNameSchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) => {
  await renameCollection(session.db, params.id, body);
  return { ok: true };
});

export const DELETE = route({ name: "collections.delete", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await deleteCollection(session.db, params.id);
  return { ok: true };
});
