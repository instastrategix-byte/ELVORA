import { listingMediaSchema } from "@backend/modules/listings/schemas";
import { addListingMedia } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "listings.media_add", feature: "business.manage", params: idParams, body: listingMediaSchema, rateLimitPerMinute: 40 },
  async ({ session, params, body }) => {
    await addListingMedia(session.db, session.viewer, params.id, body.path, body.alt);
    return { added: true };
  },
);
