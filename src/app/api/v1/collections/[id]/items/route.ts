import { addToCollection, collectionItemSchema, removeFromCollection } from "@backend/modules/collections/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "collections.items.add", params: idParams, body: collectionItemSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await addToCollection(session.db, params.id, body);
    return { ok: true };
  },
);

export const DELETE = route(
  { name: "collections.items.remove", params: idParams, body: collectionItemSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => {
    await removeFromCollection(session.db, params.id, body);
    return { ok: true };
  },
);
