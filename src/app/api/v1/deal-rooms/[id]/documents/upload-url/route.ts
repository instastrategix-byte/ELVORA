import { createDealRoomUpload, dealRoomUploadSchema } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "deal_rooms.upload_url", params: idParams, body: dealRoomUploadSchema, rateLimitPerMinute: 30 },
  async ({ session, params, body }) => createDealRoomUpload(session.db, session.viewer, params.id, body),
);
