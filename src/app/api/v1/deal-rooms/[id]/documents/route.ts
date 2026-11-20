import { dealRoomDocumentSchema, registerDealRoomDocument } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Registers an uploaded file as a document (a new version when the name matches an existing one). */
export const POST = route(
  { name: "deal_rooms.document_add", params: idParams, body: dealRoomDocumentSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => registerDealRoomDocument(session.db, params.id, body),
);
