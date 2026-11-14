import { AppError } from "@/lib/errors";
import { listingSchema } from "@backend/modules/listings/schemas";
import { deleteListing, getListingById, updateListing } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { dbFor, route } from "@backend/http/route";

export const GET = route({ name: "listings.get", auth: "public", params: idParams }, async ({ session, params }) => {
  const listing = await getListingById(await dbFor(session), session?.viewer ?? null, params.id);
  if (!listing) throw new AppError("not_found", "Listing not found.");
  return listing;
});

/** Material edits to an approved listing automatically send it back to review (DB trigger). */
export const PATCH = route(
  { name: "listings.update", feature: "business.manage", params: idParams, body: listingSchema },
  async ({ session, params, body }) => updateListing(session.db, session.viewer, params.id, body),
);

export const DELETE = route({ name: "listings.delete", params: idParams }, async ({ session, params }) => {
  await deleteListing(session.db, params.id);
  return { deleted: true };
});
