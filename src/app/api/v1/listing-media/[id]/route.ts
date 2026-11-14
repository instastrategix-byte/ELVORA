import { removeListingMedia } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const DELETE = route({ name: "listings.media_remove", params: idParams }, async ({ session, params }) => {
  await removeListingMedia(session.db, params.id);
  return { removed: true };
});
