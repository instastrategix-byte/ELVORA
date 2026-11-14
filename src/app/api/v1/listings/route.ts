import { listingBrowseSchema, listingSchema } from "@backend/modules/listings/schemas";
import { browseListings, createListing } from "@backend/modules/listings/service";
import { dbFor, route } from "@backend/http/route";

/** Published listings visible to the caller (public listings for guests; members-only with Premium). */
export const GET = route({ name: "listings.browse", auth: "public", query: listingBrowseSchema, rateLimitPerMinute: 120 }, async ({ session, query }) =>
  browseListings(await dbFor(session), session?.viewer ?? null, query),
);

export const POST = route(
  { name: "listings.create", feature: "business.manage", body: listingSchema, rateLimitPerMinute: 20 },
  async ({ session, body }) => createListing(session.db, session.viewer, body),
);
