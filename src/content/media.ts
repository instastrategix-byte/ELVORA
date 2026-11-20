import type { ListingCategory } from "@backend/modules/listings/schemas";

/**
 * Site photography. Put your own image files (that you hold the rights to) in `public/images/`
 * and set the paths below, e.g. `"/images/hero-villa.jpg"`. Recommended: JPG/WebP, at least
 * 1600px on the long edge. Any slot left `null` shows ELVORA's built-in artwork instead.
 */
export const SITE_MEDIA = {
  hero: {
    primary: "/images/business-jet-apron.webp" as string | null, // portrait, ~3:4
    secondary: "/images/superyacht-on-water.webp" as string | null, // square
  },
  categories: {
    hotel: "/images/modern-luxury-hotel-dusk.webp",
    resort: "/images/luxury-resort-infinity-pool.webp",
    villa: "/images/modern-villa-architecture.webp",
    apartment: null,
    supercar: null,
    yacht: "/images/superyacht-on-water.webp",
    aviation: "/images/business-jet-apron.webp",
    event: "/images/business-gala-luxury-venue.webp",
    experience: "/images/private-dining-terrace.webp",
  } satisfies Record<ListingCategory, string | null> as Record<ListingCategory, string | null>,
};
