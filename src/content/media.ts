import type { ListingCategory } from "@backend/modules/listings/schemas";

/**
 * Site photography. Put your own image files (that you hold the rights to) in `public/images/`
 * and set the paths below, e.g. `"/images/hero-villa.jpg"`. Recommended: JPG/WebP, at least
 * 1600px on the long edge. Any slot left `null` shows ELVORA's built-in artwork instead.
 */
export const SITE_MEDIA = {
  hero: {
    primary: null as string | null, // portrait, ~3:4 — e.g. a villa or residence
    secondary: null as string | null, // square — e.g. a yacht or supercar
  },
  categories: {
    hotel: null,
    resort: null,
    villa: null,
    apartment: null,
    supercar: null,
    yacht: null,
    aviation: null,
    event: null,
    experience: null,
  } satisfies Record<ListingCategory, string | null> as Record<ListingCategory, string | null>,
};
