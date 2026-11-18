import { collectionListQuerySchema, collectionNameSchema, createCollection, listCollections } from "@backend/modules/collections/service";
import { route } from "@backend/http/route";

/** The viewer's collections. With itemType + itemId, each entry says whether it holds that item. */
export const GET = route({ name: "collections.list", query: collectionListQuerySchema }, async ({ session, query }) =>
  listCollections(session.db, session.viewer, query.itemType && query.itemId ? { itemType: query.itemType, itemId: query.itemId } : undefined),
);

export const POST = route({ name: "collections.create", body: collectionNameSchema, rateLimitPerMinute: 20 }, async ({ session, body }) =>
  createCollection(session.db, body),
);
