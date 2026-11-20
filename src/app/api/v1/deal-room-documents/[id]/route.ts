import { z } from "zod";
import { openDealRoomDocument, removeDealRoomDocument } from "@backend/modules/deal-rooms/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/**
 * Opens (or downloads) a document. The access is logged in SQL first, then a 60-second signed URL
 * is issued with the member's own client. The URL is never stored.
 */
export const GET = route(
  { name: "deal_rooms.document_open", params: idParams, query: z.object({ download: z.enum(["1", "0"]).optional() }), rateLimitPerMinute: 60 },
  async ({ session, params, query }) => {
    const url = await openDealRoomDocument(session.db, params.id, query.download === "1" ? "download" : "view");
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
  },
);

export const DELETE = route({ name: "deal_rooms.document_remove", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await removeDealRoomDocument(session.db, params.id);
  return { ok: true };
});
